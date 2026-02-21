/**
 * Event definitions for multi-event support
 */

export const EVENTS = [
    { slug: 'designer-genes', name: 'Designer Genes C', icon: '🧬' },
    { slug: 'forensics', name: 'Forensics', icon: '🔬' },
    { slug: 'astrophysics', name: 'Astrophysics', icon: '🌌' },
    { slug: 'nle-intro', name: 'NLE Intro', icon: '🏛️' },
    { slug: 'nle-beginner', name: 'NLE Beginner', icon: '📜' },
    { slug: 'nle-level1', name: 'NLE Level 1', icon: '⚡' },
]

export const DEFAULT_EVENT = 'designer-genes'

export function getEvent(slug) {
    return EVENTS.find(e => e.slug === slug) || EVENTS[0]
}
