# Prompt Organizer

SillyTavern Prompt Manager를 정리하기 위한 UI 전용 확장입니다.

## 기능

- 모델에 주입되지 않는 화면 전용 구분선
- 특정 프롬프트 앞/뒤에 구분선 배치
- 구분선별 프롬프트 선택
- 접기/펼치기 가능한 그룹
- 프리셋별 그룹 및 접기 상태 저장
- SillyTavern 테마 CSS 변수 연동
- 한글 설정 UI

## 설치

SillyTavern의 확장 설치 화면에서 이 저장소 URL을 사용합니다.

`https://github.com/bongbong11/Prompt_Organizer`

## 사용

채팅 입력창 주변의 문서 아이콘 또는 확장 메뉴의 **프롬프트 정리**를 열고 `구분선 추가`를 누른 뒤 이름, 위치, 포함할 프롬프트를 선택합니다.

`접기 가능한 구분선`을 켜면 Prompt Manager에서 해당 구분선에 포함한 프롬프트를 접고 펼칠 수 있습니다.

## 안전 범위

Prompt Organizer는 Prompt Manager의 화면 표시만 정리합니다.

- 프롬프트 내용 변경 없음
- Role 변경 없음
- Depth / Order / Position 변경 없음
- 프롬프트 활성화 상태 변경 없음
- Chat Completion 메시지 병합 또는 재배열 없음
- 생성 직전 API 전송 배열에 개입하지 않음

접기는 화면 표시만 바꾸며 실제 프롬프트 주입과 전송 구조에는 영향을 주지 않습니다.
