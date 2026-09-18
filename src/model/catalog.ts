/**
 * Catalog: the lookup layer of the discovery graph. A catalog resolves ids
 * (topics, channels, narrative clusters, discovery sources) to their
 * definitions. Bootstrap fidelity: fully in-memory, built from fixtures.
 */

import type {
  CandidateVideo,
  ChannelProfile,
  DiscoverySource,
  NarrativeCluster,
  Topic,
} from './types';
import type {
  ChannelId,
  DiscoverySourceId,
  NarrativeClusterId,
  TopicId,
} from './types';

export interface Catalog {
  topics: Map<TopicId, Topic>;
  channels: Map<ChannelId, ChannelProfile>;
  narrativeClusters: Map<NarrativeClusterId, NarrativeCluster>;
  discoverySources: Map<DiscoverySourceId, DiscoverySource>;
}

export interface CatalogInput {
  topics: Topic[];
  channels: ChannelProfile[];
  narrativeClusters: NarrativeCluster[];
  discoverySources: DiscoverySource[];
}

export function buildCatalog(input: CatalogInput): Catalog {
  return {
    topics: new Map(input.topics.map((t) => [t.id, t])),
    channels: new Map(input.channels.map((c) => [c.id, c])),
    narrativeClusters: new Map(input.narrativeClusters.map((n) => [n.id, n])),
    discoverySources: new Map(input.discoverySources.map((s) => [s.id, s])),
  };
}

/** Referential-integrity check: every id referenced by candidates must resolve. */
export interface CatalogIntegrityIssue {
  kind: 'topic' | 'channel' | 'narrativeCluster' | 'discoverySource';
  id: string;
  referencedBy: string;
}

/**
 * Integrity check: verifies that every id a candidate references actually
 * resolves to a definition in the catalog. Returns all issues found (empty
 * array = clean). This is how fixture drift gets caught early.
 */
export function checkIntegrity(
  catalog: Catalog,
  candidates: CandidateVideo[],
): CatalogIntegrityIssue[] {
  const issues: CatalogIntegrityIssue[] = [];
  for (const c of candidates) {
    for (const t of c.topicIds) {
      if (!catalog.topics.has(t)) {
        issues.push({ kind: 'topic', id: t, referencedBy: c.id });
      }
    }
    if (!catalog.channels.has(c.channelId)) {
      issues.push({ kind: 'channel', id: c.channelId, referencedBy: c.id });
    }
    for (const n of c.narrativeClusterIds) {
      if (!catalog.narrativeClusters.has(n)) {
        issues.push({ kind: 'narrativeCluster', id: n, referencedBy: c.id });
      }
    }
    if (!catalog.discoverySources.has(c.discoveredVia)) {
      issues.push({ kind: 'discoverySource', id: c.discoveredVia, referencedBy: c.id });
    }
    for (const s of c.alsoSeenVia) {
      if (!catalog.discoverySources.has(s)) {
        issues.push({ kind: 'discoverySource', id: s, referencedBy: c.id });
      }
    }
  }
  return issues;
}

export function catalogSize(catalog: Catalog): {
  topics: number;
  channels: number;
  narrativeClusters: number;
  discoverySources: number;
} {
  return {
    topics: catalog.topics.size,
    channels: catalog.channels.size,
    narrativeClusters: catalog.narrativeClusters.size,
    discoverySources: catalog.discoverySources.size,
  };
}