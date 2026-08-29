import { ELIGIBLE_ACTIONS, TARGET_LONG_EDGE } from "./types.mjs";

export function selectCandidates(manifest, { candidateIds = [], includeHold = false } = {}) {
  if (!manifest || !Array.isArray(manifest.mediaCandidates)) {
    throw new Error("Manifest mediaCandidates must be an array.");
  }
  if (!Array.isArray(candidateIds)) {
    throw new Error("candidateIds must be an array.");
  }

  const requested = new Set();
  for (const id of candidateIds) {
    if (typeof id !== "string" || id.trim() === "") throw new Error("Candidate ID must be a non-empty string.");
    if (requested.has(id)) throw new Error(`Duplicate candidate ID: ${id}`);
    requested.add(id);
  }

  if (requested.size > 0) {
    const known = new Set(manifest.mediaCandidates.map((candidate) => candidate.id));
    for (const id of requested) {
      if (!known.has(id)) throw new Error(`Unknown candidate ID: ${id}`);
    }
  }

  const selected = [];
  for (const candidate of manifest.mediaCandidates) {
    const explicitlyRequested = requested.size > 0 && requested.has(candidate.id);
    if (requested.size > 0 && !explicitlyRequested) continue;

    if (ELIGIBLE_ACTIONS.has(candidate.oakwellAction)) {
      selected.push(candidate);
      continue;
    }

    if (candidate.oakwellAction === "hold") {
      if (!explicitlyRequested || !includeHold) {
        if (explicitlyRequested) throw new Error(`Hold candidate ${candidate.id} requires includeHold:true.`);
        continue;
      }
      selected.push(candidate);
      continue;
    }

    if (explicitlyRequested) {
      throw new Error(`Candidate ${candidate.id} with action ${candidate.oakwellAction} is not import-eligible.`);
    }
  }

  return selected;
}

export function classifyTargetLongEdge(candidate) {
  if (candidate?.subject === "showroom") return TARGET_LONG_EDGE.showroom;
  if (["kitchen", "bathroom_vanity", "commercial_project", "project"].includes(candidate?.subject)) {
    return TARGET_LONG_EDGE.project;
  }
  return TARGET_LONG_EDGE.general;
}
