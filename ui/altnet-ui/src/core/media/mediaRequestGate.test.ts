import { describe, expect, it, vi } from "vitest";
import { MediaRequestGate } from "./mediaRequestGate";

function fakeStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  return { stream, tracks };
}

describe("отмена запроса камеры или микрофона", () => {
  it("останавливает все дорожки потока, полученного после закрытия настроек", () => {
    const gate = new MediaRequestGate();
    const request = gate.begin();
    gate.cancel();
    const { stream, tracks } = fakeStream();

    expect(gate.accept(stream, request)).toBe(false);
    for (const track of tracks) expect(track.stop).toHaveBeenCalledOnce();
  });

  it("отклоняет старый поток при смене устройства и сохраняет новый", () => {
    const gate = new MediaRequestGate();
    const oldRequest = gate.begin();
    const newRequest = gate.begin();
    const oldStream = fakeStream();
    const newStream = fakeStream();

    expect(gate.accept(newStream.stream, newRequest)).toBe(true);
    expect(gate.accept(oldStream.stream, oldRequest)).toBe(false);
    for (const track of oldStream.tracks) expect(track.stop).toHaveBeenCalledOnce();
    for (const track of newStream.tracks) expect(track.stop).not.toHaveBeenCalled();
    expect(gate.isCurrent(newRequest)).toBe(true);
  });
});
