export function scrub(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
        if (v === undefined || (typeof v === "number" && Number.isNaN(v)))
            continue;
        out[k] = v;
    }
    return out;
}
