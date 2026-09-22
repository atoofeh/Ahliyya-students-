import { siFacebook, siInstagram, siX, siSnapchat, siTiktok, siLinktree } from 'simple-icons';

/**
 * The institute's social accounts — the one place they are listed.
 *
 * These are the canonical profile addresses. The links as shared from the
 * apps carried tracking parameters (igsh, utm_*, and on TikTok the sharer's
 * own user id), which have been stripped: they say nothing about the page and
 * something about whoever copied the link.
 *
 * Brand marks come from simple-icons, so each is the platform's own glyph
 * rather than a redrawing; only these six are imported, and the rest of the
 * set is left out of the bundle.
 */
export const SOCIAL = [
  { key: 'instagram', url: 'https://www.instagram.com/students_alahliyya', handle: '@students_alahliyya', icon: siInstagram },
  { key: 'tiktok', url: 'https://www.tiktok.com/@alahliyya_students', handle: '@alahliyya_students', icon: siTiktok },
  { key: 'snapchat', url: 'https://snapchat.com/t/QVFmas3k', handle: 'Snapchat', icon: siSnapchat },
  { key: 'facebook', url: 'https://www.facebook.com/share/18aCYv4i1f/', handle: 'Facebook', icon: siFacebook },
  { key: 'x', url: 'https://x.com/alahliyyastuden', handle: '@alahliyyastuden', icon: siX },
  { key: 'linktree', url: 'https://linktr.ee/alahliyya_students', handle: 'linktr.ee/alahliyya_students', icon: siLinktree },
];
