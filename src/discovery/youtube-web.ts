/**
 * YouTubeWebProvider — the first real candidate provider.
 *
 * Acquisition surface: the youtube.com pages the content script's origin
 * can already read (same-origin fetch, credentials omitted). For each
 * acquisition step it fetches ONE page, parses it with the pure
 * ytInitialData parser, and caps the harvest at MAX_PER_STEP candidates.
 * It never touches YouTube's Home recommendations and never scores anything.
 *
 * Failure handling: every failed step (HTTP error, network error, missing
 * ytInitialData, error page, zero parsable candidates) is recorded in the
 * step report — never swallowed, never retried within the same run.
 *
 * The transport is injectable so tests run against captured pages with no
 * network.
 */

import type { CandidateVideo } from '../model/types';
import type { AcquisitionStep, CandidateProvenance, DiscoveredCandidate } from '../model/discovery';
import { MAX_PER_STEP } from '../model/discovery';
import type { CandidateProvider, CandidateRequest } from './provider';
import { parseAlertError, parseChannelId, parseChannelUploads, parsePlaylist, parseSearchResults } from './yt-parser';
import type { ChannelIdResult, ParseFailure, ParseResult } from './yt-parser';

/** Minimal fetch shape — injectable for tests, real fetch in production. */
export type HtmlFetch = (url: string) => Promise<Response>;

export interface StepReport {
  step: AcquisitionStep;
  status: 'ok' | 'empty' | 'error';
  /** Candidates harvested from this step before the per-step cap. */
  harvested: number;
  /** Present when status is 'error' or 'empty'. */
  error?: string;
}

export interface AcquisitionRunResult {
  providerId: string;
  candidates: DiscoveredCandidate[];
  steps: StepReport[];
  runAt: string;
}

/** Request init applied to every acquisition fetch. */
const FETCH_INIT: Readonly<RequestInit> = {
  credentials: 'omit',
  redirect: 'follow',
};

export class YouTubeWebProvider implements CandidateProvider {
  readonly id = 'youtube-web';
  readonly label = 'YouTube (same-origin page fetch)';

  private readonly fetchHtml: HtmlFetch;

  constructor(fetchHtml: HtmlFetch = (url) => fetch(url, FETCH_INIT)) {
    this.fetchHtml = fetchHtml;
  }

  /**
   * Plan-driven acquisition. Each step maps to exactly one page fetch:
   *   seed-search      -> /results?search_query=<target>
   *   channel-uploads  -> /<target>/videos   (handle, @handle, or url)
   *   playlist         -> /playlist?list=<target>
   *   explicit-video   -> recorded, not fetched (added via oEmbed path)
   */
  async runPlan(
    steps: AcquisitionStep[],
    viewpointId: string | null,
    now: string,
  ): Promise<AcquisitionRunResult> {
    const seen = new Set<string>();
    const candidates: DiscoveredCandidate[] = [];
    const reports: StepReport[] = [];

    for (const step of steps) {
      const report = await this.runStep(step, viewpointId, now, seen, candidates);
      reports.push(report);
    }
    return { providerId: this.id, candidates, steps: reports, runAt: now };
  }

  private async runStep(
    step: AcquisitionStep,
    viewpointId: string | null,
    now: string,
    seen: Set<string>,
    candidates: DiscoveredCandidate[],
  ): Promise<StepReport> {
    const provenance = {
      provider: this.id,
      method: step.method,
      seed: step.target,
      discoveredAt: now,
      viewpointId,
    };

    let url: string;
    let parse: (
      html: string,
    ) => { ok: true; candidates: DiscoveredCandidate[] } | { ok: false; error: { reason: string } };

    switch (step.method) {
      case 'seed-search': {
        url = `https://www.youtube.com/results?search_query=${encodeURIComponent(step.target)}`;
        parse = (html) => parseSearchResults(html, provenance);
        break;
      }
      case 'channel-uploads': {
        const report = await this.runChannelUploads(step, provenance, seen, candidates);
        return report;
      }
      case 'playlist': {
        url = `https://www.youtube.com/playlist?list=${encodeURIComponent(step.target)}`;
        parse = (html) => parsePlaylist(html, { ...provenance, parentVideoId: step.target });
        break;
      }
      default: {
        // explicit-video and any future method: recorded, not fetched here.
        return {
          step,
          status: 'empty',
          harvested: 0,
          error: 'method has no page-fetch acquisition path',
        };
      }
    }

    const fetched = await this.fetchAndParse(url, parse);
    if (!fetched.ok) {
      return { step, status: 'error', harvested: 0, error: fetched.error.reason };
    }
    if (fetched.candidates.length === 0) {
      return { step, status: 'empty', harvested: 0, error: 'no candidates parsed from page' };
    }

    // Cap per step; dedup within the run.
    let harvested = 0;
    for (const c of fetched.candidates) {
      if (harvested >= MAX_PER_STEP) break;
      if (seen.has(c.videoId)) continue;
      seen.add(c.videoId);
      candidates.push(c);
      harvested += 1;
    }
    return { step, status: harvested > 0 ? 'ok' : 'empty', harvested };
  }

  /**
   * Channel uploads. Anonymous same-origin fetches of `/{@handle}/videos`
   * get a tab variant that carries no video lockups, so the provider first
   * resolves the handle to its channel id (one bounded fetch of the channel
   * homepage, reading metadata.channelMetadataRenderer.externalId), then
   * fetches `/channel/{UC id}/videos` — the page anonymous visitors get
   * with the real uploads grid. Exactly two fetches per channel step.
   */
  private async runChannelUploads(
    step: AcquisitionStep,
    provenance: CandidateProvenance,
    seen: Set<string>,
    candidates: DiscoveredCandidate[],
  ): Promise<StepReport> {
    const target = step.target;
    // Canonical id: fetch the uploads page directly (one fetch).
    if (/^UC[A-Za-z0-9_-]{22}$/.test(target)) {
      return this.harvestLockupPage(
        `https://www.youtube.com/channel/${target}/videos`,
        provenance,
        seen,
        candidates,
      );
    }
    // @handle: resolve to the canonical id first (one fetch), then fetch
    // the uploads page (second fetch). Exactly two fetches per channel.
    const handle = target.startsWith('@') ? target : `@${target}`;
    const resolved = await this.fetchAndParse(
      `https://www.youtube.com/${handle}`,
      (html) => parseChannelId(html),
    );
    if (!resolved.ok) {
      return { step, status: 'error', harvested: 0, error: resolved.error.reason };
    }
    return this.harvestLockupPage(
      `https://www.youtube.com/channel/${resolved.channelId}/videos`,
      provenance,
      seen,
      candidates,
    );
  }

  private async harvestLockupPage(
    url: string,
    provenance: CandidateProvenance,
    seen: Set<string>,
    candidates: DiscoveredCandidate[],
  ): Promise<StepReport> {
    const step = { method: 'channel-uploads' as const, target: provenance.seed, label: `channel: ${provenance.seed}` };
    const fetched = await this.fetchAndParse(url, (html) =>
      parseChannelUploads(html, { ...provenance, parentChannelId: provenance.seed }),
    );
    if (!fetched.ok) {
      return { step, status: 'error', harvested: 0, error: fetched.error.reason };
    }
    if (fetched.candidates.length === 0) {
      return { step, status: 'empty', harvested: 0, error: 'no candidates parsed from page' };
    }
    let harvested = 0;
    for (const c of fetched.candidates) {
      if (harvested >= MAX_PER_STEP) break;
      if (seen.has(c.videoId)) continue;
      seen.add(c.videoId);
      candidates.push(c);
      harvested += 1;
    }
    return { step, status: harvested > 0 ? 'ok' : 'empty', harvested };
  }

  /**
   * One bounded page fetch + parse. Network and HTTP failures and error
   * pages are converted to the parse failure shape so every caller sees one
   * uniform result union.
   */
  private async fetchAndParse<T extends ParseResult | ChannelIdResult>(
    url: string,
    parse: (html: string) => T,
  ): Promise<T | { ok: false; error: ParseFailure }> {
    let html: string;
    try {
      const res = await this.fetchHtml(url);
      if (!res.ok) {
        return { ok: false, error: { reason: `HTTP ${res.status} from ${url}` } };
      }
      html = await res.text();
    } catch (err) {
      return {
        ok: false,
        error: {
          reason: `network error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
    }
    const alert = parseAlertError(html);
    if (alert !== null) {
      return { ok: false, error: { reason: `error page: ${alert}` } };
    }
    return parse(html);
  }

  /**
   * CandidateProvider compatibility. Real acquisition is plan-driven via
   * runPlan; the provider holds no standing pool — persistence is the pool
   * layer's job (acquire.ts). Callers that only want CandidateVideo[]
   * should go through the pool layer.
   */
  async getCandidates(_request: CandidateRequest): Promise<CandidateVideo[]> {
    // The real provider cannot serve a standing pool; it must be driven by
    // a plan and its results cached by the pool layer.
    return [];
  }
}