const express = require('express');
const path = require('path');
const cors = require('cors');
const uploadRouter = require('./routes/upload');

const app = express();
const port = 3000;

// CORS 설정
app.use(cors());

// body-parser 제한 증가
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 절대 경로 설정
const PROJECT_ROOT = path.resolve(__dirname, '../');

// 정적 파일 제공 설정
app.use(express.static(path.join(PROJECT_ROOT, 'frontend')));

// 결과 이미지와 데이터 파일에 대한 정적 파일 제공 설정
app.use('/results', express.static(path.join(PROJECT_ROOT, '../HeinSight3.0/output/insseg'), {
    setHeaders: (res, path) => {
        res.set('Cache-Control', 'no-cache');
    }
}));

app.use('/raw_data', express.static(path.join(PROJECT_ROOT, '../HeinSight3.0/output/raw_data'), {
    setHeaders: (res, path) => {
        res.set('Cache-Control', 'no-cache');
    }
}));

// 디버깅을 위한 미들웨어 추가
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error('서버 에러:', err);
  res.status(500).json({
    error: '서버 오류가 발생했습니다.',
    details: err.message
  });
});

// 라우터 설정
app.use('/upload', uploadRouter);

// 404 에러 핸들러
app.use((req, res, next) => {
    console.error('404 에러 - 요청된 경로:', req.url);
    res.status(404).json({
        error: '요청한 리소스를 찾을 수 없습니다.',
        requestedPath: req.url
    });
});

app.listen(port, () => {
    console.log(`서버가 포트 ${port}에서 실행 중입니다.`);
    console.log('프로젝트 루트:', PROJECT_ROOT);
    console.log('정적 파일 경로:');
    console.log('- Frontend:', path.join(PROJECT_ROOT, 'frontend'));
    console.log('- Results:', path.join(PROJECT_ROOT, 'HeinSight3.0/output/insseg'));
    console.log('- Raw Data:', path.join(PROJECT_ROOT, 'HeinSight3.0/output/raw_data'));
});