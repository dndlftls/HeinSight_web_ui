const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const fsPromises = require('fs').promises;

// 절대 경로 설정 수정
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const UPLOAD_DIR = path.join(PROJECT_ROOT, 'backend/uploads');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'HeinSight3.0/output');
const INSSEG_DIR = path.join(OUTPUT_DIR, 'insseg');
const RAW_DATA_DIR = path.join(OUTPUT_DIR, 'raw_data');

// 디렉토리 생성 로직 추가
[UPLOAD_DIR, OUTPUT_DIR, INSSEG_DIR, RAW_DATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`디렉토리 생성됨: ${dir}`);
    }
});

// Multer 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // 파일 이름 중복 방지를 위해 타임스탬프 추가
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// 파일 필터
const fileFilter = (req, file, cb) => {
  // 허용할 파일 형식
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('지원하지 않는 파일 형식입니다.'), false);
  }
};

// Multer 에러 처리 미들웨어를 먼저 정의
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: '파일 크기가 너무 큽니다. (최대 10MB)'
      });
    }
    return res.status(400).json({
      error: '파일 업로드 중 오류가 발생했습니다.',
      details: err.message
    });
  }
  next(err);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB 제한
  }
});

// 작업 큐 관리
const queue = [];
let isProcessing = false;

// 로그 스트림을 저장할 Map
const logStreams = new Map();

// 시스템 로그 추가 함수
function addSystemLog(clientId, message, type = 'INFO') {
    if (!logStreams.has(clientId)) return;
    
    const timestamp = new Date().toISOString();
    const log = `[${timestamp}] [${type}] ${message}`;
    const streamData = logStreams.get(clientId);
    streamData.logs.push(log);
    
    // 최대 100줄 유지
    while (streamData.logs.length > 100) {
        streamData.logs.shift();
    }
}

// 최신 로그 파일 찾기 함수
async function findLatestLogFile() {
    const logDir = path.join(PROJECT_ROOT, 'HeinSight3.0/logs');
    
    try {
        // 로그 디렉토리가 없으면 생성
        if (!fs.existsSync(logDir)) {
            await fs.promises.mkdir(logDir, { recursive: true });
            console.log('로그 디렉토리 생성됨:', logDir);
        }

        const files = await fs.promises.readdir(logDir);
        const logFiles = files
            .filter(file => file.startsWith('instance_seg.log_'))
            .sort((a, b) => {
                // 파일명에서 타임스탬프 추출 (YYYY-MM-DD-HH-mm-ss 형식)
                const getTimestamp = filename => {
                    const match = filename.match(/instance_seg.log_(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})/);
                    return match ? match[1] : '';
                };
                
                const timeA = getTimestamp(a);
                const timeB = getTimestamp(b);
                
                // 타임스탬프를 비교하여 내림차순 정렬 (최신 파일이 먼저)
                return timeB.localeCompare(timeA);
            });

        // if (logFiles.length === 0) {
        //     // 로그 파일이 없으면 새로 생성
        //     const currentDate = new Date();
        //     const dateStr = currentDate.toISOString()
        //         .slice(0, 19)
        //         .replace('T', '-')
        //         .replace(/:/g, '-');
        //     const newLogFile = `instance_seg_${dateStr}.log`;
        //     const newLogPath = path.join(logDir, newLogFile);
            
        //     await fs.promises.writeFile(newLogPath, '');
        //     console.log('새 로그 파일 생성됨:', newLogPath);
        //     return newLogPath;
        // }

        const latestLogPath = path.join(logDir, logFiles[0]);
        console.log('최신 로그 파일 찾음:', latestLogPath);
        return latestLogPath;
    } catch (error) {
        console.error('로그 파일 검색 오류:', error);
        throw new Error(`로그 파일 처리 중 오류 발생: ${error.message}`);
    }
}

// 로그 스트림 생성 함수 수정
async function createLogStream(clientId) {
    try {
        // 로그 파일이 생성될 때까지 대기 (최대 10초)
        
        let retryCount = 0;
        const maxRetries = 20; // 0.5초 간격으로 20번 시도 (총 10초)
        let logPath = null;

        while (retryCount < maxRetries) {
            try {
                logPath = await findLatestLogFile();
                if (fs.existsSync(logPath)) {
                    const stats = await fs.promises.stat(logPath);
                    if (stats.size > 0) break; // 파일이 존재하고 내용이 있으면 중단
                }
            } catch (error) {
                console.log('로그 파일 대기 중...', retryCount + 1);
            }
            
            await new Promise(resolve => setTimeout(resolve, 500)); // 0.5초 대기
            retryCount++;
        }

        if (!logPath || !fs.existsSync(logPath)) {
            throw new Error('로그 파일을 찾을 수 없습니다.');
        }

        console.log('사용할 로그 파일:', logPath);

        // 이전 스트림이 있다면 정리
        if (logStreams.has(clientId)) {
            logStreams.get(clientId).kill();
            logStreams.delete(clientId);
        }

        // 초기 로그 설정
        let logs = [
            `[${new Date().toISOString()}] [INFO] 로그 모니터링을 시작합니다.`,
            `[${new Date().toISOString()}] [INFO] 로그 파일: ${path.basename(logPath)}`
        ];

        // 기존 로그 파일 내용 읽기
        const existingLogs = await fs.promises.readFile(logPath, 'utf8');
        const existingLogLines = existingLogs.split('\n').filter(Boolean);
        logs.push(...existingLogLines);

        // tail 프로세스 생성
        const tailProcess = spawn('tail', ['-F', logPath]);

        tailProcess.stdout.on('data', (data) => {
            const newLogs = data.toString().split('\n').filter(Boolean);
            logs.push(...newLogs);
            while (logs.length > 1000) {
                logs.shift();
            }
        });

        tailProcess.stderr.on('data', (data) => {
            console.error(`Tail Error: ${data.toString()}`);
        });

        logStreams.set(clientId, {
            process: tailProcess,
            logs: logs,
            kill: () => {
                tailProcess.kill();
                logStreams.delete(clientId);
            }
        });

        return logs;
    } catch (error) {
        console.error('로그 스트림 생성 오류:', error);
        throw error;
    }
}

// 로그 스트림 종료 함수 수정
async function stopLogStream(clientId) {
    try {
        if (logStreams.has(clientId)) {
            const streamData = logStreams.get(clientId);
            if (streamData.process) {
                streamData.process.kill();
            }
            logStreams.delete(clientId);
            console.log(`로그 스트림 종료됨: ${clientId}`);
        }
    } catch (error) {
        console.error('로그 스트림 종료 중 오류:', error);
    }
}

// 파일 업로드 라우트 수정
router.post('/', upload.single('file'), handleMulterError, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    try {
        const clientId = Date.now().toString();
        console.log('업로드된 파일 경로:', req.file.path);

        // Python 스크립트 실행 경로 수정
        const pythonScriptPath = path.join(PROJECT_ROOT, 'HeinSight3.0/main.py');
        console.log('Python 스크립트 경로:', pythonScriptPath);

        // 출력 디렉토리 확인 및 생성
        [INSSEG_DIR, RAW_DATA_DIR].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`디렉토리 생성됨: ${dir}`);
            }
        });

        const pythonCommand = `cd ${path.join(PROJECT_ROOT, 'HeinSight3.0')} && python3 ${pythonScriptPath} --input_image_path "${req.file.path}" --nms_iou ${req.body.nmsIou || 0.1} --conf ${req.body.confidence || 0.2} --batch_size ${req.body.batchSize || 32} --create_plots`;
        
        console.log('실행할 명령어:', pythonCommand);

        res.status(200).json({
            message: '이미지 분석이 시작되었습니다.',
            clientId: clientId
        });

        exec(pythonCommand, { timeout: 300000 }, async (error, stdout, stderr) => {
            if (error) {
                console.error('Python 스크립트 실행 오류:', error);
                console.error('Python 스크립트 stderr:', stderr);
                return;
            }
            console.log('Python 스크립트 stdout:', stdout);
            
            // 결과 파일 확인
            const outputFiles = ['output.jpg', 'turbidites.jpg'];
            outputFiles.forEach(file => {
                const filePath = path.join(INSSEG_DIR, file);
                console.log(`결과 파일 확인: ${file} - ${fs.existsSync(filePath) ? '존재함' : '존재하지 않음'}`);
            });
            
            console.log('Python 스크립트 실행 완료');
        });

    } catch (error) {
        console.error('작업 처리 중 오류:', error);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 상태 확인 라우트 추가
router.get('/status/:clientId', (req, res) => {
    const { clientId } = req.params;
    
    if (!logStreams.has(clientId)) {
        return res.json({
            status: 'not_found',
            message: '처리 상태를 찾을 수 없습니다.'
        });
    }

    const streamData = logStreams.get(clientId);
    const lastLog = streamData.logs[streamData.logs.length - 1] || '';
    
    let status = 'processing';
    if (lastLog.includes('처리가 완료되었습니다.')) {
        status = 'completed';
    } else if (lastLog.includes('오류가 발생했습니다.')) {
        status = 'error';
    }

    res.json({
        status,
        logs: streamData.logs
    });
});

// 로그 스트림 시작 라우트 수정
router.post('/start-log-stream', async (req, res) => {
    try {
        const clientId = Date.now().toString();
        await createLogStream(clientId);
        res.json({ clientId });
    } catch (error) {
        console.error('로그 스트림 시작 실패:', error);
        res.status(500).json({ 
            error: '로그 스트림 시작 실패', 
            details: error.message 
        });
    }
});

// 로그 확인 라우트 수정
router.get('/progress/:clientId', (req, res) => {
    const { clientId } = req.params;
    
    if (!logStreams.has(clientId)) {
        return res.json({
            logs: ['로그 스트림이 아직 시작되지 않았거나 찾을 수 없습니다.']
        });
    }

    const streamData = logStreams.get(clientId);
    res.json({
        logs: streamData.logs
    });
});

// 로그 스트림 종료 라우트
router.post('/stop-log-stream/:clientId', (req, res) => {
    const { clientId } = req.params;
    
    if (logStreams.has(clientId)) {
        logStreams.get(clientId).kill();
    }
    
    res.json({ message: '로그 스트림이 종료되었습니다.' });
});

// Volume 데이터 라우트 수정
router.get('/volume-data/:clientId', async (req, res) => {
    try {
        const volumeDataPath = path.join(RAW_DATA_DIR, 'volume_data.json');
        console.log('Volume 데이터 파일 경로:', volumeDataPath);

        // 파일 존재 여부 확인 및 대기
        let retryCount = 0;
        const maxRetries = 10; // 최대 10초 대기
        
        while (retryCount < maxRetries) {
            if (fs.existsSync(volumeDataPath)) {
                const stats = await fsPromises.stat(volumeDataPath);
                if (stats.size > 0) break;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            retryCount++;
            console.log(`Volume 데이터 파일 대기 중... (${retryCount}/${maxRetries})`);
        }

        if (!fs.existsSync(volumeDataPath)) {
            console.error('Volume 데이터 파일이 없음:', volumeDataPath);
            return res.status(404).json({
                error: 'Volume 데이터 파일을 찾을 수 없습니다.',
                path: volumeDataPath
            });
        }

        // 파일 읽기 시도
        try {
            const rawData = await fs.promises.readFile(volumeDataPath, 'utf8');
            console.log('Raw volume data:', rawData.substring(0, 200) + '...'); // 데이터 일부 로깅

            // JSON 파싱 시도
            const volumeData = JSON.parse(rawData);
            
            // 데이터 구조 검증
            if (!volumeData.vials) {
                throw new Error('잘못된 volume 데이터 형식: vials 속성이 없습니다.');
            }

            res.json(volumeData);
        } catch (readError) {
            console.error('파일 읽기/파싱 오류:', readError);
            return res.status(500).json({
                error: 'Volume 데이터 파일을 읽을 수 없습니다.',
                details: readError.message
            });
        }

    } catch (error) {
        console.error('Volume 데이터 처리 오류:', error);
        res.status(500).json({
            error: 'Volume 데이터를 처리하는 중 오류가 발생했습니다.',
            details: error.message
        });
    }
});

// 결과 이미지 라우트 수정
router.get('/results/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(INSSEG_DIR, filename);
    
    console.log('결과 이미지 요청:', filename);
    console.log('파일 경로:', filePath);
    
    if (!fs.existsSync(filePath)) {
        console.error('파일을 찾을 수 없음:', filePath);
        return res.status(404).json({ 
            error: '파일을 찾을 수 없습니다.',
            requestedPath: filePath 
        });
    }
    
    res.sendFile(filePath);
});

// 파일 정리 라우트 수정
router.post('/cleanup/:clientId', async (req, res) => {
    const { clientId } = req.params;
    
    try {
        console.log(`클라이언트 ${clientId}의 로그 파일 정리 시작`);
        
        // 먼저 로그 스트림 종료
        await stopLogStream(clientId);
        
        // HeinSight 로그 디렉토리 경로
        const logDir = path.join(PROJECT_ROOT, 'HeinSight3.0/logs');
        
        try {
            // 로그 디렉토리 존재 확인
            if (!fs.existsSync(logDir)) {
                console.log('로그 디렉토리가 존재하지 않습니다:', logDir);
                return res.json({
                    success: true,
                    message: '정리할 로그 파일이 없습니다.'
                });
            }

            const files = await fsPromises.readdir(logDir);
            const logFiles = files.filter(file => file.startsWith('instance_seg.log_'));
            
            console.log(`발견된 로그 파일 수: ${logFiles.length}`);
            
            // 각 로그 파일 삭제 전에 스트림이 완전히 종료되었는지 확인
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            for (const file of logFiles) {
                const filePath = path.join(logDir, file);
                try {
                    await fsPromises.unlink(filePath);
                    console.log(`로그 파일 삭제됨: ${file}`);
                } catch (error) {
                    console.error(`로그 파일 삭제 실패: ${file}`, error);
                }
            }

            console.log('로그 파일 정리 완료');
            res.json({ 
                success: true, 
                message: '로그 파일 정리가 완료되었습니다.',
                deletedFiles: logFiles.length
            });

        } catch (error) {
            console.error('로그 디렉토리 처리 중 오류:', error);
            throw error;
        }

    } catch (error) {
        console.error('로그 파일 정리 중 오류 발생:', error);
        res.status(500).json({ 
            success: false, 
            error: '로그 파일 정리 중 오류가 발생했습니다.',
            details: error.message
        });
    }
});

module.exports = router; 