// Display names, profile pictures, and the special roles and titles (OG, Beta Tester, Admin).
// Used by the website and the server, so the rules are the same on both.

// Roles the admin gives out (a player can have more than one). Each one is also a title they can wear.
export const TAGS = { og: 'OG', beta: 'Beta Tester' };
// Titles that aren't badges. "Admin" is only for the owner (the first name in ADMIN_USERNAME, SALT).
export const SPECIAL_TITLES = { og: 'OG', beta: 'Beta Tester', admin: 'Admin' };

export function cleanTags(s) {
  const list = Array.isArray(s) ? s : String(s || '').split(',');
  return [...new Set(list.map((t) => String(t).trim()).filter((t) => TAGS[t]))];
}

/* ---------------- profile pictures ----------------
   "<picture>.<background>": picture is "pip" (your own Pip) or a Pip emoji name, background is a number. */
export const PFP_BGS = ['#ffd23f', '#ff9f1c', '#ff5d8f', '#b06cff', '#3a86ff', '#7cc8ff', '#44c06a', '#a7e163', '#2ec4b6', '#1d2340', '#ffffff', '#ff5a1f'];
export function cleanPfp(s) {
  const m = /^(pip|[a-z]{2,12})\.(\d{1,2})$/.exec(String(s || ''));
  if (!m || Number(m[2]) >= PFP_BGS.length) return '';
  return m[1] + '.' + Number(m[2]);
}
export function parsePfp(s) {
  const c = cleanPfp(s);
  if (!c) return { pic: 'pip', bg: 5 };
  const [pic, bg] = c.split('.');
  return { pic, bg: Number(bg) };
}

/* ---------------- display names ----------------
   3 to 20 letters, numbers, spaces and _ . - ' !  Your @username never changes and always shows too. */
export const DISPLAY = { min: 3, max: 20, everyMs: 24 * 3600e3 };
export function cleanDisplay(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length < DISPLAY.min || t.length > DISPLAY.max) return null;
  if (!/^[A-Za-z0-9 _.'!-]+$/.test(t)) return null;
  if (!/[A-Za-z0-9]/.test(t)) return null;
  return t;
}
// "Sa L_t" -> "salt": used to stop display names that copy someone else's username
export const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Words only the owner's display name may be
export const RESERVED = ['admin', 'administrator', 'owner', 'moderator', 'mod', 'staff', 'blockyard', 'system'];
