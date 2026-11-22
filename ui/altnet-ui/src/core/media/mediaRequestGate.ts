/** Не допускает использование потока, полученного после отмены запроса. */
export class MediaRequestGate {
  private generation = 0;

  begin(): number {
    return ++this.generation;
  }

  cancel(): void {
    this.generation++;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  accept(stream: MediaStream, generation: number): boolean {
    if (this.isCurrent(generation)) return true;
    for (const track of stream.getTracks()) track.stop();
    return false;
  }
}
