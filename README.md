# HeinSight 이미지 분석 웹 애플리케이션

## 프로젝트 소개
HeinSight는 실험실에서 촬영한 이미지를 분석하여 바이알의 부피와 탁도를 자동으로 측정하는 웹 기반 분석 도구입니다. 사용자가 이미지를 업로드하면 AI 기반 이미지 처리를 통해 바이알을 감지하고, 각 바이알의 부피와 탁도를 계산하여 시각화된 결과를 제공합니다.

## 주요 기능
- 이미지 파일 업로드 및 미리보기
- 실시간 분석 진행 상황 모니터링
- 바이알 감지 및 부피 측정
- 탁도 분석 및 시각화
- 분석 결과 JSON 형식 저장
- 분석 매개변수 조정 기능

## 기술 스택
### 프론트엔드
- HTML5/CSS3/JavaScript
- 순수 JavaScript를 이용한 DOM 조작
- CSS Grid/Flexbox를 활용한 반응형 디자인

### 백엔드
- Node.js/Express.js
- Python 3.x
- OpenCV, NumPy 등 이미지 처리 라이브러리

### 인프라
- AWS EC2
- Ubuntu Server

## 설치 및 실행 방법

### 사전 요구사항
- Node.js 14.x 이상
- Python 3.x
- pip (Python 패키지 관리자)

### 설치 단계
1. 저장소 클론
```bash
git clone [repository-url]
cd web_ui
```

2. Node.js 의존성 설치
```bash
cd backend
npm install
```

3. Python 의존성 설치
```bash
cd ../HeinSight3.0
pip install -r requirements.txt
```

4. 필요한 디렉토리 생성
```bash
mkdir -p backend/uploads
mkdir -p HeinSight3.0/output/insseg
mkdir -p HeinSight3.0/output/raw_data
mkdir -p HeinSight3.0/logs
```

### 실행 방법
1. 백엔드 서버 실행
```bash
cd backend
npm start
```

2. 웹 브라우저에서 접속
```
http://localhost:3000
```

## 사용 방법
1. '이미지 선택' 버튼을 클릭하여 분석할 이미지 파일을 선택합니다.
2. 필요한 경우 분석 매개변수(NMS IOU, 신뢰도, 배치 크기)를 조정합니다.
3. '분석 시작' 버튼을 클릭하여 이미지 분석을 시작합니다.
4. 실시간으로 진행 상황을 확인할 수 있습니다.
5. 분석이 완료되면 결과 이미지와 부피 데이터를 확인할 수 있습니다.

## 주의사항
- 지원되는 이미지 형식: JPG, PNG
- 최대 파일 크기: 10MB
- 권장 이미지 해상도: 1920x1080 이상
- 분석에는 약 1-2분 정도 소요될 수 있습니다.

## 문제 해결
- 404 에러 발생 시: 업로드 및 결과 디렉토리가 올바르게 생성되었는지 확인
- 로그 파일 오류: logs 디렉토리의 권한 확인
- 메모리 부족 오류: 배치 크기 조정 필요

## 라이선스
이 프로젝트는 MIT 라이선스를 따릅니다.

## 기여 방법
1. Fork the Project
2. Create your Feature Branch
3. Commit your Changes
4. Push to the Branch
5. Open a Pull Request

## 연락처
프로젝트에 대한 문의나 버그 리포트는 Issues를 통해 제출해 주시기 바랍니다.

---
이 README는 프로젝트의 기본적인 정보를 담고 있으며, 필요에 따라 내용을 수정하거나 보완할 수 있습니다.
