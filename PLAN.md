# Sync Progress and Recovery Implementation Plan

## Overview
sync 진행률 표시(스피너, 카운터) 추가. 중단 후 재시작 복구(체크포인트) + embeddings 누락 보정.

## Current State Analysis
- `lastSyncAt` 단일 값 사용, 종료 시 1회 저장. 중간 종료 복구 없음. `src/commands/sync.ts:13`, `src/commands/sync.ts:107`
- Bear 읽기 `sinceMs` 필터만 있고 정렬 없음. `src/bear/bear-reader.ts:64`, `src/bear/bear-reader.ts:70`
- notes/fts/embeddings 업데이트 트랜잭션 없음, embeddings 삭제 후 재삽입. `src/commands/sync.ts:70`, `src/commands/sync.ts:93`
- 진행률 출력 없음, 완료 로그만. `src/commands/sync.ts:111`
- `sync_state`는 key/value 테이블. `src/db/sqlite-client.ts:34`

## Desired End State
- TTY: 스피너 + `processed/total`, `updated`, `skipped` 카운터 실시간 표시.
- Non-TTY: 주기 로그로 진행률 표시 + 완료 요약.
- 중단 후 재실행 시 체크포인트부터 이어서 처리, 누락 없음.
- 노트 단위 원자적 업데이트(notes/fts/embeddings/체크포인트).
- embeddings 누락 감지 시 재처리.

## What We're NOT Doing
- 새로운 CLI 플래그 추가 없음.
- Bear DB 쓰기/수정 없음.
- 병렬 임베딩/동기화 없음.
- UI/GUI 작업 없음.

## Assumptions / Defaults
- 체크포인트는 `lastSyncAt` + `lastSyncId`로 저장, 정렬 기준은 `updatedAt` 오름차순 + `id` 오름차순.
- `readBearNotes`는 기존대로 사용, 체크포인트 필터/정렬은 sync 단계에서 처리.
- 무결성 보정은 embeddings row가 0인 경우 재처리하되, 본문이 비어있는 노트는 0개 정상으로 간주.
- 새 외부 의존성 추가 없음.
- Non-TTY 진행률 로그는 일정 간격(예: 25건)으로 제한.

## Implementation Approach
- sync 시작 시 체크포인트(`lastSyncAt`, `lastSyncId`) 로드, 후보 노트 목록 정렬/필터.
- 기존 notes 해시 + embeddings 개수 맵 구성, 재처리 필요 여부 판단.
- 임베딩 계산은 트랜잭션 밖에서 수행, DB 반영은 노트 단위 트랜잭션으로 원자성 확보.
- 각 노트 처리 완료 시 체크포인트 업데이트하여 재시작 시 이어서 가능.
- 진행률 헬퍼로 TTY 스피너/Non-TTY 로그 분기.

## Public API / Interface Changes
- `sniff sync` 출력 형식 변경(진행률/요약 추가).
- `sync_state`에 `lastSyncId` 키 추가(데이터 스키마 변경 없음).

---

## - [x] Phase 1: Checkpointed, Atomic Sync

### Overview
중단 복구 안전성 확보 + embeddings 누락 보정.

### Changes Required:

#### 1. Sync Core Restructure
**File**: `src/commands/sync.ts`
**Changes**: 체크포인트 로드/저장 로직 추가(`src/commands/sync.ts:13`), 노트 처리 루프(`src/commands/sync.ts:75`)를 정렬/필터 + per-note 트랜잭션 구조로 교체. embeddings 개수 맵 조회 및 재처리 조건 추가.

#### 2. Checkpoint Helper (Optional for Testability)
**File**: `src/sync/checkpoint.ts`
**Changes**: 노트 정렬/필터, 체크포인트 비교 로직을 순수 함수로 분리하여 테스트 가능하게 구성.

### Success Criteria:
- [ ] 중간 종료 후 재실행 시 이미 처리한 노트 재처리 최소화, 누락 없음.
- [ ] notes/fts/embeddings/체크포인트가 노트 단위로 원자적 반영.
- [ ] embeddings 누락(0개) 노트가 재처리됨(단, 본문이 비어있는 노트는 0개 허용).

---

## - [ ] Phase 2: Progress Display

### Overview
sync 진행률을 TTY/Non-TTY 환경에 맞게 표시.

### Changes Required:

#### 1. Progress Helper
**File**: `src/utils/progress.ts`
**Changes**: 스피너 프레임, update/finish API 제공. TTY 여부 판단 및 출력 줄 갱신 처리.

#### 2. Sync Integration
**File**: `src/commands/sync.ts`
**Changes**: 처리 카운터(`processed`, `updated`, `skipped`, `total`) 계산/갱신 및 진행률 출력 연결. 완료 요약 로그 확장.

### Success Criteria:
- [ ] TTY에서 스피너 + 카운터가 노트 진행에 맞춰 갱신됨.
- [ ] Non-TTY에서 과도한 로그 없이 진행률이 확인됨.
- [ ] 완료 시 요약 로그가 정확함.

---

## Testing Strategy

### Unit Tests:
- 체크포인트 필터/정렬 로직 테스트(`tests/unit/sync-checkpoint.test.ts`).
- 재처리 조건(해시 불일치, embeddings 0개) 테스트(`tests/unit/sync-integrity.test.ts`).

### Integration Tests:
- Bear DB/임베딩 의존성 때문에 자동화 어려움. 수동 검증으로 대체.

### Manual Testing Steps:
1. `pnpm dev -- sync` 실행, 진행률/요약 출력 확인.
2. sync 중 강제 종료 후 재실행, 체크포인트 복구 확인.
3. embeddings 일부 삭제 후 재실행, 누락 노트 재처리 확인.

## Performance Considerations
- embeddings 개수 맵 조회 추가. 대규모 DB일 때 쿼리 비용 증가 가능.
- 노트별 임베딩 벡터를 메모리에 잠시 보관 후 트랜잭션 반영.

## Migration Notes
- 스키마 변경 없음. `sync_state`에 새 key 추가만 수행.

## References

### Research Findings
- 없음.

### Other Sources
- `src/commands/sync.ts:30` sync 흐름 확인.
- `src/bear/bear-reader.ts:29` Bear DB 읽기 로직 확인.
- `src/db/sqlite-client.ts:11` DB 스키마 확인.
- `tests/unit/hash.test.ts:1` 테스트 스타일 확인.
