export function isAdminSessionCurrent(
  expectedSessionVersion: number,
  currentSessionVersion: number,
  expectedAdminUserId: string | null,
  activeAdminUserId: string | null
): boolean {
  return Number.isSafeInteger(expectedSessionVersion)
    && Number.isSafeInteger(currentSessionVersion)
    && expectedSessionVersion === currentSessionVersion
    && typeof expectedAdminUserId === "string"
    && expectedAdminUserId.length > 0
    && expectedAdminUserId === activeAdminUserId;
}
