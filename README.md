# Prompt Organizer

SillyTavern Chat Completion Prompt Manager를 정리하기 위한 UI 전용 확장입니다.

## 기능

- 모델에 주입되지 않는 화면 전용 구분선
- OpenAI 사전 설정에서 현재 선택된 프리셋 자동 사용
- SillyTavern Prompt Manager의 현재 표시 순서 그대로 프롬프트 표시
- 특정 프롬프트 앞/뒤에 구분선 배치
- 구분선별 프롬프트 선택 및 접기/펼치기
- 프리셋별 구분선 설정 저장
- 저장된 구분선 수정/삭제
- SillyTavern 테마 CSS 변수 연동
- 모바일 대응 한글 UI

## 설치

SillyTavern의 확장 설치 화면에서 이 저장소 URL을 사용합니다.

`https://github.com/bongbong11/Prompt_Organizer`

## 사용

OpenAI 사전 설정의 토글 프리셋 영역에서 **그룹 관리** 옆의 **프롬프트 정리** 버튼 또는 확장 메뉴의 **프롬프트 정리**를 엽니다.

1. 현재 OpenAI 사전 설정에서 사용할 프리셋을 선택합니다.
2. **프롬프트 정리**를 열면 그 프리셋과 Prompt Manager의 현재 프롬프트 순서를 그대로 읽습니다.
3. **새 구분선** 탭에서 이름, 기준 위치, 접을 프롬프트를 선택하고 저장합니다.
4. **저장된 구분선** 탭에서 기존 설정을 수정하거나 삭제할 수 있습니다.

## 안전 범위

Prompt Organizer는 현재 Prompt Manager 상태를 읽어 화면 정리 기준을 얻고, 자체 구분선 설정만 `extensionSettings.promptOrganizer`에 저장합니다.

- 프롬프트 내용 변경 없음
- Role 변경 없음
- Depth / Order / Position 변경 없음
- 프롬프트 활성화 상태 변경 없음
- 프리셋 저장/덮어쓰기 없음
- Chat Completion 메시지 병합 또는 재배열 없음
- 생성 직전 API 전송 배열에 개입하지 않음

접기는 Prompt Manager DOM 표시만 바꾸며 실제 프롬프트 주입과 전송 구조에는 영향을 주지 않습니다.
