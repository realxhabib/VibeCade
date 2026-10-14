export {
  connect,
  resetConnection,
  VibeCadeClient,
  type AchievementUnlock,
  type AchievementsApi,
  type AutoResizeOptions,
  type ConnectOptions,
  type LogApi,
  type MediaApi,
  type MediaUploadOptions,
  type RoundApi,
  type SetupApi,
  type StateApi,
  type StateChange,
  type StateSnapshot,
  type StateUpdateOptions,
  type StateUpdater,
  type StatLeaderboardOptions,
  type StatsApi,
  type StorageApi,
  type StorageListOptions,
  type StorageOptions,
  type TurnApi,
  type TurnInfo,
} from "./client";
export { createRandom, randomId, type Random } from "./random";
export {
  createDirectMesh,
  DEFAULT_ICE_SERVERS,
  DIRECT_EVENT,
  type DirectClient,
  type DirectMesh,
  type DirectOptions,
  type DirectPeerInfo,
  type DirectSendOptions,
  type DirectStatus,
  type DirectVia,
} from "./direct";
export { calmPage, lockGestures } from "./gestures";
export {
  createMockHost,
  type MockHost,
  type MockHostOptions,
  type MockLogEntry,
  type MockSetupOutcome,
} from "./mock-host";
export {
  LIMITS,
  PROTOCOL_VERSION,
  SDK_VERSION,
  VibeCadeError,
  type ErrorCode,
  type HapticStyle,
  type HostEvent,
  type HostEventData,
  type Json,
  type AchievementDef,
  type LaunchContext,
  type LogLevel,
  type LaunchPurpose,
  type MatchMode,
  type MatchResult,
  type MatchStatus,
  type MediaRef,
  type PlayerInfo,
  type PlayerRole,
  type RoomMessage,
  type Scoring,
  type StatDef,
  type StatLeaderEntry,
  type StatStanding,
  type StorageScope,
  type Submission,
  type SubmissionDisplay,
  type SubmitResult,
  type ToastTone,
} from "./protocol";

// The names from before the VibeCade rename (the SDK was @xapps/sdk), so existing apps keep working.
export {
  /** @deprecated Renamed: use `VibeCadeClient`. */
  VibeCadeClient as XAppsClient,
} from "./client";
export {
  /** @deprecated Renamed: use `VibeCadeError`. */
  VibeCadeError as XAppsError,
} from "./protocol";
