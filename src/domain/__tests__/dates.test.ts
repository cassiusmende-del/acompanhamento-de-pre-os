import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDaysAgo,
  formatDurationDays,
  parseLocalDateTime,
  toLocalDateTimeInput,
} from "../dates";

describe("datas no fuso de São Paulo", () => {
  it("formata data e hora", () => {
    const date = new Date("2026-09-12T17:02:00Z");
    expect(formatDate(date)).toBe("12/09/2026");
    expect(formatDateTime(date)).toBe("12/09/2026 14:02");
    // 01:00 UTC ainda é o dia anterior em São Paulo
    expect(formatDate(new Date("2026-09-13T01:00:00Z"))).toBe("12/09/2026");
  });

  it("interpreta datetime-local como horário de São Paulo", () => {
    expect(parseLocalDateTime("2026-09-12T14:02")?.toISOString()).toBe("2026-09-12T17:02:00.000Z");
    expect(parseLocalDateTime("2026-02-30T10:00")).toBeNull();
    expect(parseLocalDateTime("12/09/2026 14:02")).toBeNull();
    expect(parseLocalDateTime("2026-09-12T14:02", "UTC")?.toISOString()).toBe(
      "2026-09-12T14:02:00.000Z",
    );
  });

  it("ida e volta para o campo datetime-local", () => {
    const date = new Date("2026-09-12T17:02:00Z");
    expect(toLocalDateTimeInput(date)).toBe("2026-09-12T14:02");
    expect(parseLocalDateTime(toLocalDateTimeInput(date))?.getTime()).toBe(date.getTime());
  });

  it("textos relativos e durações", () => {
    const now = new Date("2026-09-12T12:00:00Z");
    expect(formatDaysAgo(new Date("2026-09-12T08:00:00Z"), now)).toBe("hoje");
    expect(formatDaysAgo(new Date("2026-09-11T08:00:00Z"), now)).toBe("há 1 dia");
    expect(formatDaysAgo(new Date("2026-07-27T12:00:00Z"), now)).toBe("há 47 dias");
    expect(formatDurationDays(3 * 3600_000)).toBe("3 horas");
    expect(formatDurationDays(1.5 * 86400_000)).toBe("1,5 dias");
    expect(formatDurationDays(86400_000)).toBe("1 dia");
    expect(formatDurationDays(12.4 * 86400_000)).toBe("12 dias");
  });
});
