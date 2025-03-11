document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM 로드됨');
    
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const startAnalysisBtn = document.getElementById('startAnalysisBtn');
    const fileName = document.getElementById('fileName');
    const fileInfo = document.getElementById('fileInfo');
    const imagePreview = document.getElementById('imagePreview');
    const previewContainer = document.getElementById('previewContainer');
    const progressContainer = document.getElementById('progressContainer');
    const results = document.getElementById('results');
    const progress = document.getElementById('progress');
    const progressLogs = document.getElementById('progressLogs');
    let progressInterval;
    let clientId = null;
    const nmsIou = document.getElementById('nmsIou');
    const confidence = document.getElementById('confidence');
    const batchSize = document.getElementById('batchSize');
    let selectedFile = null;

    if (!fileInput || !uploadBtn || !fileName || !progressContainer || !progress || !progressLogs || !results) {
        console.error('필수 DOM 요소를 찾을 수 없습니다.');
        return;
    }

    uploadBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // 현재 활성화된 요소의 포커스를 제거
        if (document.activeElement) {
            document.activeElement.blur();
        }
        
        // 약간의 지연 후 파일 선택 다이얼로그 표시
        await new Promise(resolve => setTimeout(resolve, 50));
        
        if (fileInput) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const file = e.target.files[0];
        if (!file) return;

        // 파일 유효성 검사
        if (!file.type.startsWith('image/')) {
            alert('이미지 파일만 선택할 수 있습니다.');
            return;
        }

        selectedFile = file;
        fileName.textContent = file.name;
        fileInfo.textContent = `크기: ${formatFileSize(file.size)} | 유형: ${file.type}`;

        // 이미지 미리보기 생성
        try {
            const reader = new FileReader();
            
            await new Promise((resolve, reject) => {
                reader.onload = () => {
                    try {
                        imagePreview.src = reader.result;
                        previewContainer.classList.remove('hidden');
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                };
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
            });

            // 포커스 처리를 위한 지연
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 부드러운 스크롤 대신 직접 포커스
            startAnalysisBtn.focus({preventScroll: true});
            
            // 분석 시작 버튼 활성화
            startAnalysisBtn.disabled = false;
            
        } catch (error) {
            console.error('파일 처리 오류:', error);
            alert('파일을 처리하는 중 오류가 발생했습니다.');
        }
    });

    startAnalysisBtn.addEventListener('click', async () => {
        if (!selectedFile || !validateParameters()) return;

        try {
            // UI 초기화
            startAnalysisBtn.disabled = true;
            progressContainer.classList.remove('hidden');
            results.classList.add('hidden');

            // 파일 업로드 및 분석 시작
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('nmsIou', document.getElementById('nmsIou').value);
            formData.append('confidence', document.getElementById('confidence').value);
            formData.append('batchSize', document.getElementById('batchSize').value);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`업로드 실패 (${response.status})`);
            }

            const data = await response.json();
            startProgressMonitoring(data.clientId);

        } catch (error) {
            console.error('분석 시작 오류:', error);
            alert('분석을 시작하는 중 오류가 발생했습니다.');
            startAnalysisBtn.disabled = false;
        }
    });

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function validateParameters() {
        const nmsIou = parseFloat(document.getElementById('nmsIou').value);
        const confidence = parseFloat(document.getElementById('confidence').value);
        const batchSize = parseInt(document.getElementById('batchSize').value);

        if (isNaN(nmsIou) || nmsIou < 0 || nmsIou > 1) {
            alert('NMS IOU 값은 0과 1 사이여야 합니다.');
            return false;
        }
        if (isNaN(confidence) || confidence < 0 || confidence > 1) {
            alert('신뢰도 값은 0과 1 사이여야 합니다.');
            return false;
        }
        if (isNaN(batchSize) || batchSize < 1 || batchSize > 128) {
            alert('배치 크기는 1에서 128 사이여야 합니다.');
            return false;
        }
        return true;
    }

    async function startProgressMonitoring(newClientId) {
        try {
            clientId = newClientId;
            const startTime = Date.now();
            const maxWaitTime = 300000; // 5분 타임아웃
            let retryCount = 0;
            const maxRetries = 3;

            // 주기적으로 상태 확인
            progressInterval = setInterval(async () => {
                try {
                    console.log('상태 확인 중...');
                    const statusResponse = await fetch(`/upload/status/${clientId}`);
                    console.log('상태 응답:', statusResponse.status);

                    if (!statusResponse.ok) {
                        throw new Error(`상태 확인 실패 (${statusResponse.status})`);
                    }

                    const statusData = await statusResponse.json();
                    console.log('상태 데이터:', statusData);

                    // 로그 업데이트
                    if (statusData.logs && Array.isArray(statusData.logs)) {
                        progressLogs.innerHTML = statusData.logs
                            .map(log => {
                                let className = 'log-info';
                                if (log.includes('WARNING')) className = 'log-warning';
                                if (log.includes('ERROR')) className = 'log-error';
                                return `<div class="${className}">${log}</div>`;
                            })
                            .join('');
                        progressLogs.scrollTop = progressLogs.scrollHeight;
                    }

                    // 처리 완료 확인
                    if (statusData.status === 'completed' || 
                        statusData.logs.some(log => 
                            log.includes('이미지 처리가 완료되었습니다.') || 
                            log.includes('Detections saved at'))) {
                        
                        clearInterval(progressInterval);
                        console.log('처리 완료');
                        progress.style.width = '100%';

                        // 결과 표시 전 잠시 대기
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        // 결과 표시
                        const timestamp = Date.now();
                        document.getElementById('outputImage').src = `/results/output.jpg?t=${timestamp}`;
                        document.getElementById('turbidityImage').src = `/results/turbidites.jpg?t=${timestamp}`;

                        await displayVolumeData(clientId);
                        results.classList.remove('hidden');
                        return;
                    }

                    // 에러 확인
                    if (statusData.status === 'error' || 
                        statusData.logs.some(log => log.includes('ERROR'))) {
                        throw new Error('이미지 처리 중 오류가 발생했습니다.');
                    }

                    // 진행 상태 업데이트
                    progress.style.width = '50%';

                    // 시간 초과 확인
                    if (Date.now() - startTime > maxWaitTime) {
                        clearInterval(progressInterval);
                        throw new Error('처리 시간이 초과되었습니다.');
                    }

                } catch (error) {
                    console.error('상태 확인 오류:', error);
                    if (++retryCount > maxRetries) {
                        clearInterval(progressInterval);
                        throw error;
                    }
                }
            }, 1000); // 1초마다 상태 확인

        } catch (error) {
            console.error('모니터링 시작 오류:', error);
            alert('처리 상태 모니터링을 시작할 수 없습니다.');
        }
    }

    // 페이지 언로드 시 로그 스트림 정리
    window.addEventListener('beforeunload', async () => {
        await stopLogStream();
    });

    async function cleanupFiles(clientId) {
        try {
            console.log('=== 로그 파일 정리 시작 ===');
            const cleanupUrl = `/upload/cleanup/${clientId}`;
            
            const response = await fetch(cleanupUrl, {
                method: 'POST'
            });
            
            console.log('정리 요청 상태:', response.status);
            
            if (!response.ok) {
                throw new Error(`로그 파일 정리 실패 (${response.status})`);
            }
            
            const result = await response.json();
            console.log('로그 파일 정리 결과:', result);
            
        } catch (error) {
            console.error('로그 파일 정리 중 오류 발생:', error);
        }
    }

    async function displayVolumeData(clientId) {
        try {
            console.log('=== Volume 데이터 요청 시작 ===');
            console.log('ClientID:', clientId);
            
            // 데이터 요청 전 충분한 대기 시간 추가
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const volumeDataUrl = `/upload/volume-data/${clientId}`;
            console.log('요청 URL:', volumeDataUrl);
            
            const response = await fetch(volumeDataUrl);
            console.log('서버 응답 상태 코드:', response.status);
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('볼륨 데이터가 아직 생성되지 않았습니다. 잠시 후 다시 시도해주세요.');
                }
                const errorText = await response.text();
                throw new Error(`서버 오류 (${response.status}): ${errorText}`);
            }

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.error('잘못된 응답 타입:', contentType);
                throw new Error(`잘못된 응답 타입: ${contentType}`);
            }

            const volumeData = await response.json();
            console.log('수신된 Volume 데이터 구조:', JSON.stringify(volumeData, null, 2));

            if (!volumeData || !volumeData.vials) {
                console.error('잘못된 데이터 구조:', volumeData);
                throw new Error('볼륨 데이터 형식이 올바르지 않습니다');
            }

            // vial 데이터 처리 전 로깅
            console.log('처리할 vial 개수:', Object.keys(volumeData.vials).length);
            
            const volumeContainer = document.createElement('div');
            volumeContainer.className = 'volume-data-container';

            // vial 데이터 표시
            Object.entries(volumeData.vials).forEach(([vialKey, vialData], index) => {
                console.log(`Vial ${index + 1} (${vialKey}) 처리 중:`, vialData);
                
                if (Array.isArray(vialData) && vialData.length > 0) {
                    const vialElement = document.createElement('div');
                    vialElement.className = 'vial-data';

                    const vialTitle = document.createElement('h3');
                    vialTitle.textContent = `${vialKey.replace('_', ' ').toUpperCase()}`;
                    vialElement.appendChild(vialTitle);

                    const segmentList = document.createElement('ul');
                    vialData.forEach((segment, segIndex) => {
                        console.log(`Segment ${segIndex + 1} 처리 중:`, segment);
                        
                        if (segment && Array.isArray(segment.volumes) && segment.volumes.length > 0) {
                            const segmentItem = document.createElement('li');
                            const volume = volumeData.is_image ? 
                                segment.volumes[0] : 
                                segment.volumes[segment.volumes.length - 1];

                            console.log(`Segment ${segIndex + 1} 볼륨:`, volume);

                            if (typeof volume === 'number' && !isNaN(volume)) {
                                segmentItem.textContent = `Segment ${segment.segment}: ${volume.toFixed(2)} mL`;
                                segmentList.appendChild(segmentItem);
                            } else {
                                console.warn(`유효하지 않은 볼륨 값:`, volume);
                            }
                        }
                    });

                    if (segmentList.children.length > 0) {
                        vialElement.appendChild(segmentList);
                        volumeContainer.appendChild(vialElement);
                    }
                }
            });

            // DOM 업데이트 전 확인
            const volumeSection = document.getElementById('volumeData');
            if (!volumeSection) {
                console.error('volumeData 요소를 찾을 수 없음');
                throw new Error('volumeData 요소를 찾을 수 없습니다');
            }
            
            console.log('DOM 업데이트 시작');
            volumeSection.innerHTML = '';
            volumeSection.appendChild(volumeContainer);
            console.log('DOM 업데이트 완료');

            // 이미지 업데이트
            const timestamp = Date.now();
            const outputImageUrl = `/results/output.jpg?t=${timestamp}`;
            const turbidityImageUrl = `/results/turbidites.jpg?t=${timestamp}`;
            
            console.log('이미지 URL:', {
                output: outputImageUrl,
                turbidity: turbidityImageUrl
            });
            
            const outputImage = document.getElementById('outputImage');
            const turbidityImage = document.getElementById('turbidityImage');
            
            if (outputImage) outputImage.src = outputImageUrl;
            if (turbidityImage) turbidityImage.src = turbidityImageUrl;

            // 결과 섹션 표시
            const resultsSection = document.getElementById('results');
            if (resultsSection) {
                resultsSection.classList.remove('hidden');
                console.log('결과 섹션 표시됨');
            }

            // 모든 데이터를 성공적으로 표시한 후 로그 파일 정리 실행
            await cleanupFiles(clientId);

        } catch (error) {
            console.error('=== Volume 데이터 표시 오류 ===');
            console.error('오류 상세:', error);
            
            // 재시도 로직 추가
            if (error.message.includes('볼륨 데이터가 아직 생성되지 않았습니다')) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                // return await displayVolumeData(clientId); // 재귀적 재시도
            }
            
            // 오류 메시지 표시
            const errorMessage = document.createElement('div');
            errorMessage.className = 'error-message';
            errorMessage.style.color = 'red';
            errorMessage.style.padding = '10px';
            errorMessage.textContent = `결과 표시 중 오류가 발생했습니다: ${error.message}`;
            
            const volumeSection = document.getElementById('volumeData');
            if (volumeSection) {
                volumeSection.innerHTML = '';
                volumeSection.appendChild(errorMessage);
            }
        }
    }

    // 로그 스트림 시작
    async function startLogStream() {
        try {
            console.log("startLogStream 실행");
            const response = await fetch('/upload/start-log-stream', {
                method: 'POST'
            });
            const data = await response.json();
            clientId = data.clientId;
            return clientId;
        } catch (error) {
            console.error('로그 스트림 시작 실패:', error);
            return null;
        }
    }

    // 로그 스트림 종료
    async function stopLogStream() {
        if (!clientId) return;
        
        try {
            await fetch(`/upload/stop-log-stream/${clientId}`, {
                method: 'POST'
            });
            clientId = null;
        } catch (error) {
            console.error('로그 스트림 종료 실패:', error);
        }
    }

    // 로그 업데이트 함수
    async function updateProgress() {
        if (!clientId) return;

        try {
            const response = await fetch(`/upload/progress/${clientId}`);
            const data = await response.json();
            
            // 로그 표시
            if (data.logs && data.logs.length > 0) {
                progressLogs.innerHTML = data.logs
                    .map(log => {
                        let className = 'log-info';
                        if (log.includes('WARNING')) className = 'log-warning';
                        if (log.includes('ERROR')) className = 'log-error';
                        return `<p class="${className}">${log}</p>`;
                    })
                    .join('');
                progressLogs.scrollTop = progressLogs.scrollHeight;
            }

            // 처리가 완료되면 인터벌 중지
            if (!data.isProcessing && data.queueLength === 0) {
                clearInterval(progressInterval);
                await stopLogStream();
            }
        } catch (error) {
            console.error('진행 상황 업데이트 실패:', error);
            clearInterval(progressInterval);
            await stopLogStream();
        }
    }
});     