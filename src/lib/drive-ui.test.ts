import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  connect: vi.fn(),
  upload: vi.fn(),
  valid: false,
  warning: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: h.warning } }));
vi.mock("./drive", () => ({
  connectDrive: h.connect,
  uploadToDrive: h.upload,
  driveConfigured: () => true,
  driveEnabled: () => true,
  driveTokenValid: () => h.valid,
}));

import { reconnectAndSave, saveFileToDrive } from "./drive-ui";

const file = new File(["x"], "a.pdf");

describe("drive-ui reconnect", () => {
  beforeEach(() => {
    h.connect.mockReset();
    h.upload.mockReset();
    h.warning.mockReset();
    h.valid = false;
  });

  it("without a token it only warns and does not upload", async () => {
    const st = vi.fn();
    await saveFileToDrive(file, vi.fn(), st);
    expect(st).toHaveBeenCalledWith("needs-reconnect");
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.warning).toHaveBeenCalled();
  });

  it("reconnectAndSave connects, uploads and reports the id", async () => {
    h.connect.mockResolvedValue(undefined);
    h.upload.mockResolvedValue("drive123");
    const saved = vi.fn();
    const st = vi.fn();
    await reconnectAndSave(file, saved, st);
    expect(h.connect).toHaveBeenCalledOnce();
    expect(saved).toHaveBeenCalledWith("drive123");
    expect(st).toHaveBeenLastCalledWith("saved");
  });

  it("reconnectAndSave reports failed when access is refused", async () => {
    h.connect.mockRejectedValue(new Error("Drive access was not allowed."));
    const saved = vi.fn();
    const st = vi.fn();
    await reconnectAndSave(file, saved, st);
    expect(saved).not.toHaveBeenCalled();
    expect(st).toHaveBeenLastCalledWith("failed");
  });
});
