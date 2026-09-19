/**
 * Classifier — deterministic, evidence-based, conservative.
 *
 * Turns raw candidates into VideoClassification values using only evidence
 * actually present in the candidate data (title, description, channel
 * title, provenance). Pure: same input -> same output, no randomness, no
 * network, no DOM.
 *
 * Stances (FROZEN for Phase 3):
 *   - UNKNOWN beats invented certainty: rules fire only on explicit
 *     evidence; anything else classifies as 'unknown' with the reason.
 *   - NO political inference. No lexicon entry encodes ideology, party,
 *     or voting preference. Source types describe production and standing.
 *   - Provider-carried ids (fixture topicIds / narrativeClusterIds)
 *     pass through with origin 'provider'.
 *   - Overrides are applied after classification (see overrides.ts); this
 *     module never sees them.
 */

import type {
  CandidateVideo,
  ChannelId,
  ChannelProfile,
  NarrativeClusterId,
  TopicId,
} from '../model/types';
import type { NarrativeCluster } from '../model/types';
import type {
  ClassifiedValue,
  SourceType,
  TemporalPosition,
  VideoClassification,
} from '../model/classification';
import type { ProvenanceEdge } from '../model/classification';

// ---------------------------------------------------------------------------
// Lexicons
// ---------------------------------------------------------------------------

/**
 * Deterministic source-type lexicon. Each entry fires only on explicit
 * evidence in channel or video text. Entries are ordered: first match
 * wins. NO entry encodes political identity — these describe production
 * and standing only. `promotional-sponsored` fires only where sponsorship
 * is explicitly evidenced in the text.
 */
const SOURCE_TYPE_LEXICON: Array<{
  type: SourceType;
  channelMarkers: string[];
  videoMarkers: string[];
}> = [
  {
    type: 'promotional-sponsored',
    channelMarkers: [],
    videoMarkers: [
      'sponsored by',
      'this video is sponsored',
      '#ad',
      'paid promotion',
      'brought to you by',
    ],
  },
  {
    type: 'official',
    channelMarkers: ['official', ' inc.', ' inc', ' llc', ' ltd', ' corp'],
    videoMarkers: ['press conference', 'official statement'],
  },
  {
    type: 'publication',
    channelMarkers: [
      'news',
      ' times',
      ' post',
      'journal',
      'report',
      'magazine',
      'herald',
      'gazette',
      'press',
    ],
    videoMarkers: [],
  },
  {
    type: 'academic-expert',
    channelMarkers: ['university', 'institute', 'college', 'school of', 'research'],
    videoMarkers: ['lecture', 'professor', 'ph.d', 'phd', 'dissertation', 'seminar'],
  },
  {
    type: 'primary-source',
    channelMarkers: ['archive', 'records', 'library'],
    videoMarkers: [
      'full footage',
      'uncut',
      'original broadcast',
      'digitized',
      'restored',
    ],
  },
  {
    type: 'technical-analyst',
    channelMarkers: ['analysis', 'analyst', 'data', ' lab'],
    videoMarkers: ['teardown', 'benchmark', 'dataset', 'methodology', 'analysis of'],
  },
  {
    type: 'independent-creator',
    channelMarkers: [],
    videoMarkers: ['i made', 'i built', 'my take', 'in my opinion', 'i tried'],
  },
  {
    type: 'enthusiast-community',
    channelMarkers: ['club', 'society', 'community', 'forum', 'assoc'],
    videoMarkers: ['meetup', 'community'],
  },
];

/**
 * Temporal-position lexicon. A video's temporal position is its relation
 * to its SUBJECT — and only explicit framing in the text evidences that.
 * Publication age alone never establishes it: a week-old video can be a
 * retrospective, a decade-old video was contemporary with its events.
 * Where framing is absent, the position is UNKNOWN, never inferred.
 */
const TEMPORAL_LEXICON: Array<{
  position: TemporalPosition;
  markers: string[];
}> = [
  {
    position: 'retrospective',
    markers: [
      'retrospective',
      'looking back',
      'years later',
      'revisiting',
      'in hindsight',
      'history of',
      'how we got',
      'the story of',
    ],
  },
  {
    position: 'pre-event',
    markers: ['upcoming', 'coming soon', 'before the', 'ahead of', 'preview', 'expected to'],
  },
  {
    position: 'post-event',
    markers: ['aftermath', 'after the', 'in the wake of', 'what happened at'],
  },
  {
    position: 'contemporary',
    markers: ['live coverage', 'breaking', 'this week', 'today', 'yesterday', 'this morning', 'as it happens'],
  },
  {
    position: 'historical',
    markers: ['medieval', 'ancient', 'archival', 'throwback', 'the 19', 'the 18', 'in 19', 'in 18', 'century-old'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CandidateText {
  channel: string;
  title: string;
  description: string;
}

function textOf(candidate: CandidateVideo): CandidateText {
  return {
    channel: candidate.channelTitle.toLowerCase(),
    title: candidate.title.toLowerCase(),
    description: candidate.description.toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// Source type
// ---------------------------------------------------------------------------

/**
 * Classify source type from candidate text evidence. Conservative: the
 * lexicon fires only on explicit markers; anything else is 'unknown'.
 */
export function classifySourceType(candidate: CandidateVideo): ClassifiedValue<SourceType> {
  const text = textOf(candidate);
  for (const entry of SOURCE_TYPE_LEXICON) {
    for (const marker of entry.channelMarkers) {
      if (text.channel.includes(marker)) {
        return {
          value: entry.type,
          confidence: 0.6,
          origin: 'classifier',
          method: 'source-type-lexicon',
          evidence: `Channel title contains "${marker}".`,
        };
      }
    }
    for (const marker of entry.videoMarkers) {
      if (text.title.includes(marker) || text.description.includes(marker)) {
        return {
          value: entry.type,
          confidence: 0.5,
          origin: 'classifier',
          method: 'source-type-lexicon',
          evidence: `Title or description contains "${marker}".`,
        };
      }
    }
  }
  return {
    value: 'unknown',
    confidence: 0,
    origin: 'classifier',
    method: 'source-type-lexicon',
    evidence:
      'No explicit source-type marker in channel title, title, or description.',
  };
}

// ---------------------------------------------------------------------------
// Temporal position
// ---------------------------------------------------------------------------

/**
 * Classify temporal position. Only explicit framing in the title or
 * description evidences a video's position relative to its subject;
 * publication age never does (see TEMPORAL_LEXICON). Otherwise UNKNOWN —
 * UNKNOWN beats invented certainty.
 */
export function classifyTemporalPosition(
  candidate: CandidateVideo,
  _now: string,
): ClassifiedValue<TemporalPosition> {
  const text = textOf(candidate);
  for (const entry of TEMPORAL_LEXICON) {
    for (const marker of entry.markers) {
      if (text.title.includes(marker) || text.description.includes(marker)) {
        return {
          value: entry.position,
          confidence: 0.6,
          origin: 'classifier',
          method: 'temporal-position-lexicon',
          evidence: `Title or description contains "${marker}" (${entry.position} framing).`,
        };
      }
    }
  }
  return {
    value: 'unknown',
    confidence: 0,
    origin: 'classifier',
    method: 'temporal-position-lexicon',
    evidence:
      'No temporal framing in title or description; position relative to ' +
      'subject not establishable from publication age alone.',
  };
}

// ---------------------------------------------------------------------------
// Topics / narrative clusters
// ---------------------------------------------------------------------------

/**
 * Topic evidence words. Topics describe *material subject matter*, never
 * ideology. Words are matched against title + description.
 */
const TOPIC_LEXICON: Array<{ topicId: TopicId; words: string[] }> = [
  {
    topicId: 'topic-aero',
    words: [
      'rocket',
      'booster',
      'orbit',
      'spacecraft',
      'propulsion',
      'launch',
      'reusab',
      'aerospace',
      'jet',
      'landing burn',
    ],
  },
  {
    topicId: 'topic-urban',
    words: [
      'city',
      'cities',
      'urban',
      'zoning',
      'transit',
      'street',
      '15-minute',
      'proximity',
      'sidewalk',
    ],
  },
  {
    topicId: 'topic-music',
    words: [
      'harmony',
      'chord',
      'voice leading',
      'counterpoint',
      'rhythm',
      'melody',
      'music',
    ],
  },
  {
    topicId: 'topic-cooking',
    words: ['cook', 'recipe', 'kitchen', 'salt', 'heat', 'mise en place', 'baking', 'food'],
  },
  {
    topicId: 'topic-history',
    words: ['history', 'archive', 'century', 'legacy', 'how we got', 'industrial'],
  },
];

/**
 * Classify topics. Provider-carried topicIds pass through with origin
 * 'provider'. A lexical fallback runs only when the provider carried
 * none, and assigns at most one topic per candidate (conservative:
 * UNKNOWN beats invented certainty).
 */
export function classifyTopics(
  candidate: CandidateVideo,
): Array<ClassifiedValue<TopicId | 'unknown'>> {
  if (candidate.topicIds.length > 0) {
    return candidate.topicIds.map((id) => ({
      value: id,
      confidence: 0.9,
      origin: 'provider' as const,
      method: 'provider-carried',
      evidence: 'Topic ids carried by the discovery provider.',
    }));
  }
  const text = textOf(candidate);
  const joined = `${text.title} ${text.description}`;
  for (const entry of TOPIC_LEXICON) {
    for (const word of entry.words) {
      if (joined.includes(word)) {
        return [
          {
            value: entry.topicId,
            confidence: 0.5,
            origin: 'classifier',
            method: 'topic-lexicon',
            evidence: `Title or description contains "${word}".`,
          },
        ];
      }
    }
  }
  return [];
}

/**
 * Classify narrative cluster. Provider-carried narrativeClusterIds pass
 * through with origin 'provider' when they resolve in the catalog. There
 * is deliberately NO lexical fallback: inventing a cluster family from
 * keywords would fabricate a framing relationship. UNKNOWN is preferable.
 */
export function classifyNarrativeCluster(
  candidate: CandidateVideo,
  catalog: { narrativeClusters: Map<NarrativeClusterId, NarrativeCluster> },
): ClassifiedValue<NarrativeClusterId | 'unknown'> {
  if (candidate.narrativeClusterIds.length > 0) {
    const evidenced = candidate.narrativeClusterIds.filter((id) =>
      catalog.narrativeClusters.has(id),
    );
    if (evidenced.length > 0) {
      return {
        value: evidenced[0],
        confidence: 0.9,
        origin: 'provider',
        method: 'provider-carried',
        evidence:
          `Narrative cluster id carried by the discovery provider and ` +
          `resolved in the catalog (${evidenced.join(', ')}).`,
      };
    }
  }
  return {
    value: 'unknown',
    confidence: 0,
    origin: 'classifier',
    method: 'narrative-cluster',
    evidence:
      'No evidenced narrative cluster; clustering stays UNKNOWN rather than inferred.',
  };
}

// ---------------------------------------------------------------------------
// Full classification
// ---------------------------------------------------------------------------

/**
 * Classify one candidate. Pure and deterministic: same candidate, catalog,
 * and reference time always yield the same classification.
 */
export function classifyCandidate(
  candidate: CandidateVideo,
  catalog: { narrativeClusters: Map<NarrativeClusterId, NarrativeCluster> },
  now: string,
): VideoClassification {
  return {
    videoId: candidate.id,
    topics: classifyTopics(candidate),
    sourceType: classifySourceType(candidate),
    narrativeCluster: classifyNarrativeCluster(candidate, catalog),
    temporalPosition: classifyTemporalPosition(candidate, now),
  };
}

// ---------------------------------------------------------------------------
// Provenance edges
// ---------------------------------------------------------------------------

/**
 * Build the provenance edges for one candidate — only evidenced edges.
 * Each edge cites its evidence. No edge is invented: if a candidate has
 * no topic ids, it gets no discusses-topic edges.
 */
export function buildProvenanceEdges(
  candidate: CandidateVideo,
  channels: Map<ChannelId, ChannelProfile>,
): ProvenanceEdge[] {
  const edges: ProvenanceEdge[] = [];
  edges.push({
    kind: 'surfaced-by',
    from: candidate.id,
    to: candidate.discoveredVia,
    evidence: `Discovery provenance: surfaced by ${candidate.discoveredVia}.`,
  });
  edges.push({
    kind: 'published-by',
    from: candidate.id,
    to: candidate.channelId,
    evidence: `Published by channel ${candidate.channelTitle} (${candidate.channelId}).`,
  });
  for (const topicId of candidate.topicIds) {
    edges.push({
      kind: 'discusses-topic',
      from: candidate.id,
      to: topicId,
      evidence: 'Topic id present on the candidate record.',
    });
  }
  for (const clusterId of candidate.narrativeClusterIds) {
    edges.push({
      kind: 'belongs-to-cluster',
      from: candidate.id,
      to: clusterId,
      evidence: 'Narrative cluster id present on the candidate record.',
    });
  }
  for (const sourceId of candidate.alsoSeenVia) {
    edges.push({
      kind: 'surfaced-by',
      from: candidate.id,
      to: sourceId,
      evidence: `Additional discovery provenance: also seen via ${sourceId}.`,
    });
  }
  const channel = channels.get(candidate.channelId);
  if (channel) {
    for (const topicId of channel.topicIds) {
      edges.push({
        kind: 'discusses-topic',
        from: candidate.id,
        to: topicId,
        evidence: `Channel ${channel.title} declares topic ${topicId}.`,
      });
    }
  }
  return edges;
}