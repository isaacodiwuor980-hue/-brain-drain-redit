#!/usr/bin/env python3
"""
Brain Drain — Production Roadmap PDF (body).
Generated via ReportLab. Cover is generated separately via html2poster.js
and merged in a post-step.

Output: /home/z/my-project/download/brain-drain-roadmap-body.pdf
Final merge step: /home/z/my-project/download/brain-drain-roadmap.pdf
"""
import os
import sys
import hashlib
import platform

# ── Skill paths ────────────────────────────────────────────────────
PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, CondPageBreak, HRFlowable
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ── Font registration (Linux) ──────────────────────────────────────
# Use only fonts confirmed to exist on this system.
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
# SarasaMonoSC for any CJK mono fallback (only the variable NotoSansSC[wght].ttf exists,
# which ReportLab cannot load reliably — skip Noto Sans SC family and rely on NotoSerifSC).
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Italic", f"{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-BoldItalic", f"{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSans", f"{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf"))

registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")
registerFontFamily("FreeSerif", normal="FreeSerif", bold="FreeSerif-Bold",
                   italic="FreeSerif-Italic", boldItalic="FreeSerif-BoldItalic")
registerFontFamily("DejaVuSans", normal="DejaVuSans", bold="DejaVuSans")

# Install font fallback for mixed CJK/Latin (defensive — content is English)
from pdf import install_font_fallback
install_font_fallback()

# ── Cascade Palette (auto-generated) ───────────────────────────────
PAGE_BG       = colors.HexColor("#f1f2f3")
SECTION_BG    = colors.HexColor("#e8eaeb")
CARD_BG       = colors.HexColor("#ebedee")
TABLE_STRIPE  = colors.HexColor("#eff1f2")
HEADER_FILL   = colors.HexColor("#475b65")
COVER_BLOCK   = colors.HexColor("#3a535f")
BORDER        = colors.HexColor("#a8b5bc")
ICON          = colors.HexColor("#3f83a5")
ACCENT        = colors.HexColor("#367fa4")
ACCENT_2      = colors.HexColor("#b94a5c")
TEXT_PRIMARY  = colors.HexColor("#151717")
TEXT_MUTED    = colors.HexColor("#70777a")
SEM_SUCCESS   = colors.HexColor("#388251")
SEM_WARNING   = colors.HexColor("#ac8b4a")
SEM_ERROR     = colors.HexColor("#a65c56")
SEM_INFO      = colors.HexColor("#4f6c88")

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ── Styles ─────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

H1 = ParagraphStyle(
    name="H1", fontName="FreeSerif-Bold", fontSize=18, leading=24,
    textColor=HEADER_FILL, spaceBefore=24, spaceAfter=12, alignment=TA_LEFT
)
H2 = ParagraphStyle(
    name="H2", fontName="FreeSerif-Bold", fontSize=13.5, leading=18,
    textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=8, alignment=TA_LEFT
)
H3 = ParagraphStyle(
    name="H3", fontName="FreeSerif-Bold", fontSize=11.5, leading=16,
    textColor=ACCENT, spaceBefore=10, spaceAfter=4, alignment=TA_LEFT
)
BODY = ParagraphStyle(
    name="Body", fontName="FreeSerif", fontSize=10.5, leading=17,
    textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=8, alignment=TA_JUSTIFY
)
BODY_LEFT = ParagraphStyle(
    name="BodyLeft", parent=BODY, alignment=TA_LEFT
)
BULLET = ParagraphStyle(
    name="Bullet", parent=BODY_LEFT, leftIndent=18, bulletIndent=4,
    spaceBefore=2, spaceAfter=4
)
META = ParagraphStyle(
    name="Meta", fontName="FreeSerif-Italic", fontSize=9, leading=13,
    textColor=TEXT_MUTED, spaceAfter=6, alignment=TA_LEFT
)
CALLOUT = ParagraphStyle(
    name="Callout", fontName="FreeSerif", fontSize=10.5, leading=17,
    textColor=TEXT_PRIMARY, leftIndent=14, rightIndent=10,
    spaceBefore=8, spaceAfter=12, alignment=TA_LEFT, borderColor=ACCENT,
    borderWidth=0, borderPadding=8, backColor=CARD_BG
)
TABLE_CAPTION = ParagraphStyle(
    name="TableCaption", fontName="FreeSerif-Italic", fontSize=9.5, leading=13,
    textColor=TEXT_MUTED, alignment=TA_CENTER, spaceBefore=4, spaceAfter=12
)

# ── TOC Doc Template ───────────────────────────────────────────────
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            self.notify("TOCEntry", (level, text, self.page, key))

def add_heading(text, style, level=0):
    key = "h_%s" % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/>%s' % (key, text), style)
    p.bookmark_name = text
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

A4_W, A4_H = A4
LEFT_MARGIN = RIGHT_MARGIN = 0.85 * inch
TOP_MARGIN = BOTTOM_MARGIN = 0.75 * inch
AVAILABLE_HEIGHT = A4_H - TOP_MARGIN - BOTTOM_MARGIN
H1_ORPHAN_THRESHOLD = AVAILABLE_HEIGHT * 0.15

# ── Page number footer (drawn on every body page) ──────────────────
def draw_page_footer(canvas, doc):
    """Draw 'Brain Drain · Production Roadmap' (left) + page number (right)
    in the bottom margin of every body page. Body starts at page 2 (cover is page 1)."""
    canvas.saveState()
    # Footer line
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(LEFT_MARGIN, BOTTOM_MARGIN - 18,
                A4_W - RIGHT_MARGIN, BOTTOM_MARGIN - 18)
    # Left: doc title
    canvas.setFont("FreeSerif-Italic", 8.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(LEFT_MARGIN, BOTTOM_MARGIN - 30,
                      "Brain Drain  ·  Production Roadmap")
    # Right: page number (cover is page 1, so body page N = canvas page N+1)
    page_num = canvas.getPageNumber() + 1
    canvas.setFont("FreeSerif", 8.5)
    canvas.drawRightString(A4_W - RIGHT_MARGIN, BOTTOM_MARGIN - 30,
                           f"Page {page_num}")
    canvas.restoreState()

def major_section(text):
    return [CondPageBreak(H1_ORPHAN_THRESHOLD), add_heading(text, H1, level=0)]

def sub_section(text):
    return [add_heading(text, H2, level=1)]

# ── Helpers ────────────────────────────────────────────────────────
def safe_keep_together(elements):
    MAX_KEEP_HEIGHT = A4_H * 0.4
    total_h = 0
    for el in elements:
        try:
            _, h = el.wrap(A4_W - 2 * LEFT_MARGIN, A4_H)
            total_h += h
        except Exception:
            return list(elements)
    if total_h <= MAX_KEEP_HEIGHT:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)

def callout_box(text_html):
    """Accent left border + light tint background. Max one per section."""
    p = Paragraph(text_html, CALLOUT)
    # Wrap in a 1-column table to apply the left border
    t = Table([[p]], colWidths=[A4_W - 2 * LEFT_MARGIN])
    t.setStyle(TableStyle([
        ("LINEBEFORE", (0, 0), (0, 0), 3, ACCENT),
        ("BACKGROUND", (0, 0), (0, 0), CARD_BG),
        ("LEFTPADDING", (0, 0), (0, 0), 14),
        ("RIGHTPADDING", (0, 0), (0, 0), 10),
        ("TOPPADDING", (0, 0), (0, 0), 10),
        ("BOTTOMPADDING", (0, 0), (0, 0), 10),
        ("VALIGN", (0, 0), (0, 0), "TOP"),
    ]))
    return t

def std_table(data, col_widths, caption=None):
    """Standard styled table: HEADER_FILL header + white/stripe rows + center hAlign."""
    t = Table(data, colWidths=col_widths, hAlign="CENTER", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ("TEXTCOLOR", (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ("FONTNAME", (0, 0), (-1, 0), "FreeSerif-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9.5),
        ("ALIGN", (0, 0), (-1, 0), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (0, 1), (-1, -1), "FreeSerif"),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("TEXTCOLOR", (0, 1), (-1, -1), TEXT_PRIMARY),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, HEADER_FILL),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [TABLE_ROW_EVEN, TABLE_ROW_ODD]),
    ]
    t.setStyle(TableStyle(style))
    items = [t]
    if caption:
        items.append(Spacer(1, 4))
        items.append(Paragraph(caption, TABLE_CAPTION))
    else:
        items.append(Spacer(1, 12))
    return items

def P(text, style=BODY):
    return Paragraph(text, style)

def bl(text):
    return Paragraph("•  " + text, BULLET)

# ── Build story ────────────────────────────────────────────────────
story = []

# ── TOC PAGE (cover is added later via pypdf merge) ────────────────
toc = TableOfContents()
toc.levelStyles = [
    ParagraphStyle(name="TOC1", fontName="FreeSerif-Bold", fontSize=11.5, leading=20,
                   textColor=TEXT_PRIMARY, leftIndent=8, rightIndent=20),
    ParagraphStyle(name="TOC2", fontName="FreeSerif", fontSize=10, leading=16,
                   textColor=TEXT_MUTED, leftIndent=28, rightIndent=20),
]
story.append(Paragraph("<b>Table of Contents</b>", ParagraphStyle(
    name="TOCTitle", fontName="FreeSerif-Bold", fontSize=22, leading=28,
    textColor=HEADER_FILL, alignment=TA_LEFT, spaceAfter=18)))
story.append(HRFlowable(width="100%", color=ACCENT, thickness=1.5, spaceBefore=0, spaceAfter=18))
story.append(toc)
story.append(PageBreak())

# ───────────────────────────────────────────────────────────────────
# CHAPTER 1 — Executive Summary
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 1 — Executive Summary"))

story.append(P(
    "This roadmap takes Brain Drain from <b>working locally</b> to <b>running live for real users</b>. "
    "It is deliberately phased so that each phase is independently shippable: stop after any phase and "
    "the app is in a better state than before. No big-bang rewrite, no risky merges, no surprise regressions."
))

story.append(P(
    "The current state is honest and verified, not assumed: the Express API server is running in production "
    "mode (auto-restart, NODE_ENV=production), Firebase Auth is wired to a real project "
    "(<font name='DejaVuSans'>thin-script-nwh20</font>), the 4-river comment system is restored from a "
    "previous git stash, and the typecheck has zero errors. What is missing is the actual cloud backend "
    "(Supabase is configured as a placeholder URL), production-grade discovery features so the homepage is "
    "never blank, and the hardening pass that lets the app survive real traffic."
))

story.append(P(
    "This roadmap fixes five things in order: (1) the cloud database goes live in Supabase with the "
    "existing 25-table migration deployed, (2) authentication goes production-grade with real Firebase "
    "providers enabled, (3) five zero-cost discovery methods ship so users can find each other without "
    "friction, (4) the 299 TODO/FIXME markers in the codebase get triaged and the dead code gets removed, "
    "and (5) production hardening (backups, rate limits, monitoring, load test) wraps up. Total estimated "
    "effort is roughly 12 working days for one engineer, with a critical-path minimum of 6 days."
))

story.append(callout_box(
    "<b>Verified state at start of roadmap:</b><br/>"
    "•  typecheck: <b>0 errors</b> (down from 81 in the prior broken state)<br/>"
    "•  tests: <b>37/37 PASS</b><br/>"
    "•  build: <b>PASS</b> (dist/server.cjs 71.9 KB)<br/>"
    "•  routes: <b>7/7 return 200</b> (/ , /api/healthz, /api/ready, /privacy-policy, /terms-of-service, /sw.js, /manifest.webmanifest)<br/>"
    "•  4-river comment system: <b>RESTORED</b> (Facts / Experience / Debate / Breakthrough streams live)"
))

# ───────────────────────────────────────────────────────────────────
# CHAPTER 2 — Current State Audit
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 2 — Current State Audit (Verified, Not Claimed)"))

story.append(P(
    "Every claim below is backed by a file path or a measurement, not a memory. The prior session had "
    "claimed typecheck was PASS when it was actually failing with 81 errors; that false claim is what "
    "triggered this audit. The lesson: verify before claiming."
))

audit_data = [
    ["Layer", "State", "Evidence", "Risk"],
    ["Firebase Auth", "Wired, real project",
     "firebase-applet-config.json has real project ID thin-script-nwh20 + API key; api-server/src/middleware/auth.ts verifies Firebase ID tokens via Google JWKS",
     "Low"],
    ["Supabase schema", "Designed, NOT deployed",
     "supabase/migrations/0001_initial_schema.sql is 25 KB, 25 tables, 47 RLS policies; SUPABASE_URL still placeholder",
     "High — blocks cloud sync"],
    ["API server", "12 routes, live",
     "feed, posts, topics, search, brains, events, intelligence, recommendations, health, data-api, client-errors, index — all mounted in app.ts",
     "Low"],
    ["Auth middleware", "Real, server-side",
     "requireAuth + optionalAuth verify Firebase ID tokens; tests exist",
     "Low"],
    ["Contact sync", "Zero code exists",
     "No contact / addressBook / syncContacts references in src (only in node_modules)",
     "High — blocks Phase 6/7"],
    ["TODO/FIXME markers", "299 in codebase",
     "grep -rE 'TODO|FIXME' across *.ts/*.tsx returns 299 hits",
     "Medium — tech debt"],
    ["Git history", "Only 3 commits",
     "Most work was uncommitted in working tree; restored from stash@{0}",
     "Medium — recovery risk"],
]

story.extend(std_table(
    audit_data,
    col_widths=[85, 110, 230, 80],
    caption="Table 1 — Verified state of the Brain Drain codebase at start of this roadmap."
))

story.extend(sub_section("Regressions Found and Fixed This Session"))

story.append(P(
    "Three regressions were identified during the audit pass. All three are now resolved and committed "
    "in commit <font name='DejaVuSans'>837ff55</font>:"
))

story.append(bl(
    "<b>4-river comment system was in a stash, not HEAD.</b> The Facts/Experience/Debate/Breakthrough "
    "streams existed in stash@{0} (646-line CommentThread.tsx) but HEAD had reverted to the original "
    "188-line single-thread version. Fixed by cherry-picking the 4-river files from the stash."
))
story.append(bl(
    "<b>Typecheck had been silently failing.</b> 81 errors accumulated because lib/types.ts was missing "
    "32 type exports that the Phase 1-4 pure-logic modules import. Fixed by adopting the stash's "
    "lib/types.ts (1755 lines, full superset with STREAM_META + all needed types)."
))
story.append(bl(
    "<b>lib/hive-mind.ts was lost.</b> The 4-river code imports computeCommentRank, countSourceLinks, "
    "and computeSourceLinkReputation from this file. It existed earlier but was lost during a stash/restore "
    "cycle and was never committed. Fixed by recreating a minimal 75-line version with the 3 needed "
    "functions (the original 359-line file also had maintenance jobs that nothing imports, so they were "
    "intentionally not re-implemented)."
))

# ───────────────────────────────────────────────────────────────────
# CHAPTER 3 — Roadmap Overview & Sequencing
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 3 — Roadmap Overview & Sequencing"))

story.append(P(
    "The roadmap is split into 9 phases (0 through 8). Each phase has a single clear goal, a list of "
    "small verifiable tasks, an effort estimate, and a verification gate. The critical path runs through "
    "Phase 0 (cleanup) and Phase 1 (Supabase live) before branching into the discovery phases; Phase 8 "
    "(hardening) closes the loop. Phases 3 through 7 can be run in parallel or in any order once Phases "
    "1 and 2 are done — they are independent discovery features."
))

roadmap_data = [
    ["Phase", "Name", "Goal", "Effort", "Deps", "Shippable?"],
    ["0", "Audit + Cleanup", "Triage 299 TODOs, remove dead code, no regressions", "1.5d", "—", "Yes"],
    ["1", "Supabase Live", "Deploy migration to real Supabase project", "0.5d", "0", "Yes"],
    ["2", "Auth Production", "Enable Firebase providers, replace mock user", "1.5d", "1", "Yes"],
    ["3", "Topic Suggestions", "People you may know via shared topics", "0.5d", "2", "Yes"],
    ["4", "Username Search", "Autocomplete find by @username", "0.5d", "2", "Yes"],
    ["5", "Pre-populated Feed", "Kill blank homepage for new users", "1.0d", "2", "Yes"],
    ["6", "Phone Contact Sync", "Contact Picker API + SHA-256 hash match", "2.0d", "2", "Yes"],
    ["7", "Google Email OAuth", "People API + email hash match", "2.0d", "2", "Yes"],
    ["8", "Production Hardening", "Backups, monitoring, load test, CI/CD", "2.5d", "all", "Yes"],
]

story.extend(std_table(
    roadmap_data,
    col_widths=[42, 95, 175, 45, 38, 60],
    caption="Table 2 — All 9 phases. Total ~12 working days for one engineer. Critical path = 6 days minimum."
))

story.append(P(
    "The dependency graph is straightforward: Phase 0 unblocks everything (working on a clean base is "
    "faster than working around debt). Phases 1 and 2 unblock the discovery features. Phases 3, 4, and "
    "5 are quick wins that can ship together as a 'findability bundle' — together they take 2 days and "
    "make the app immediately more useful to a new user. Phases 6 and 7 are the heavier discovery "
    "features (contact sync and Google OAuth) that require more careful privacy handling. Phase 8 closes "
    "out with the production hardening that lets the app survive real traffic."
))

story.append(callout_box(
    "<b>Iron rule:</b> Each phase is independently shippable. You can stop after any phase and the app "
    "is in a strictly better state than before. There is no 'all or nothing' commit. This is deliberate — "
    "it is what makes the roadmap safe to execute under time pressure."
))

# ───────────────────────────────────────────────────────────────────
# CHAPTER 4 — Phase 0: Audit + Cleanup + Revert Regressions
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 4 — Phase 0: Audit + Cleanup + Revert Regressions"))

story.extend(sub_section("Goal"))
story.append(P(
    "Clean foundation before adding any new features. Working on a codebase with 299 untracked TODO "
    "markers and unknown dead code is slower than cleaning first then building. This phase pays back "
    "its 1.5-day cost within the first week of subsequent work."
))

story.extend(sub_section("Tasks (small, verifiable)"))

story.append(bl(
    "<b>Scan all 299 TODO/FIXME markers.</b> Run <font name='DejaVuSans'>grep -rn 'TODO\\|FIXME' --include='*.ts' --include='*.tsx'</font> "
    "and dump to a file. Triage each into four buckets: <b>fix now</b> (small enough to do inline, "
    "blocks a phase), <b>fix in phase N</b> (defer to the relevant phase), <b>won't fix</b> (intentional "
    "limitation, document it), <b>already fixed</b> (stale marker, remove)."
))
story.append(bl(
    "<b>Remove dead code.</b> Use TypeScript's <font name='DejaVuSans'>--noUnusedLocals</font> and "
    "<font name='DejaVuSans'>--noUnusedParameters</font> flags to find unused exports, imports, and "
    "variables. Delete orphaned files (no importer anywhere). For each deletion, run typecheck + tests "
    "to verify nothing broke."
))
story.append(bl(
    "<b>Verify no other regressions exist.</b> Compare the current working tree to stash@{0} for any "
    "other cherry-pickable improvements. The stash had 280 file changes; only 4 were cherry-picked for "
    "the 4-river restore. There may be other features in the stash that should be reviewed and selectively "
    "restored."
))
story.append(bl(
    "<b>Commit everything.</b> Single atomic commit titled "
    "<font name='DejaVuSans'>cleanup: triage 299 TODOs + remove dead code</font>. Working tree ends clean."
))

story.extend(sub_section("Verification Gate"))
story.append(P(
    "typecheck: 0 errors. Tests: at least 37 PASS (more if any new tests are added). Build: PASS. "
    "All 7 routes return 200. Working tree clean."
))

story.extend(sub_section("Effort & Risk"))
story.append(P(
    "Effort: 1.5 days. Risk: low — every change is verified by typecheck + tests before commit. The "
    "biggest risk is being too aggressive with dead-code removal and breaking something subtle; mitigate "
    "by committing after each batch of deletions so a regression can be bisected quickly."
))

# ───────────────────────────────────────────────────────────────────
# CHAPTER 5 — Phase 1: Supabase Live (Walk-Through)
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 5 — Phase 1: Supabase Live (Walk-Through)"))

story.extend(sub_section("Goal"))
story.append(P(
    "Deploy the existing 25-table migration to a real Supabase project so the app can sync posts, "
    "profiles, and reactions to the cloud instead of staying local-only in IndexedDB."
))

story.extend(sub_section("Step-by-Step Walk-Through (you do not have a Supabase yet)"))

story.append(P(
    "<b>Step 1.</b> Go to <font name='DejaVuSans'>supabase.com</font> and sign up with your GitHub "
    "account. The free tier requires no credit card and includes 500 MB of Postgres storage, 1 GB of "
    "file storage, and 50,000 monthly active users — more than enough for the first 10,000 users."
))
story.append(P(
    "<b>Step 2.</b> Click <b>New Project</b>. Pick a name (e.g. <font name='DejaVuSans'>brain-drain-prod</font>), "
    "generate a strong database password (save it in a password manager — Supabase will not show it "
    "again), and pick the region closest to your users. For a Kenya-based audience, the Frankfurt "
    "(eu-central-1) region gives the best latency compromise across Africa and Europe."
))
story.append(P(
    "<b>Step 3.</b> Wait roughly 2 minutes for Supabase to provision the project. The dashboard will "
    "show a 'Setting up project' spinner; once it clears, the project is ready."
))
story.append(P(
    "<b>Step 4.</b> In the Supabase dashboard, go to <b>Project Settings → API</b>. Copy three "
    "values: the <b>Project URL</b> (looks like <font name='DejaVuSans'>https://abcdefgh.supabase.co</font>), "
    "the <b>anon public</b> key, and the <b>service_role</b> key. The service_role key bypasses RLS so "
    "treat it like a production secret — never commit it, never expose it to the client."
))
story.append(P(
    "<b>Step 5.</b> In your local <font name='DejaVuSans'>.env</font> file (copy from .env.example), "
    "set the three values: <font name='DejaVuSans'>SUPABASE_URL=...</font>, "
    "<font name='DejaVuSans'>SUPABASE_ANON_KEY=...</font>, "
    "<font name='DejaVuSans'>SUPABASE_SERVICE_ROLE_KEY=...</font>. Add the same values to your hosting "
    "provider's environment variables panel (Render, Railway, or wherever the API server is deployed)."
))
story.append(P(
    "<b>Step 6.</b> Deploy the migration. The simplest path is to open Supabase's <b>SQL Editor</b> "
    "in the dashboard, paste the contents of <font name='DejaVuSans'>supabase/migrations/0001_initial_schema.sql</font>, "
    "and click <b>Run</b>. The migration is idempotent (uses <font name='DejaVuSans'>CREATE TABLE IF NOT EXISTS</font>) "
    "so it is safe to run more than once. Then run "
    "<font name='DejaVuSans'>supabase/migrations/0002_search.sql</font> the same way to set up full-text "
    "search indexes."
))
story.append(P(
    "<b>Step 7.</b> Verify the schema landed. In the SQL Editor, run "
    "<font name='DejaVuSans'>\\d</font> (list tables) — you should see 25 tables including "
    "<font name='DejaVuSans'>profiles, topics, posts, comments, reactions, missions, communities, "
    "conversations, notifications, pathways, analytics_events</font> and the rest. Then run "
    "<font name='DejaVuSans'>SELECT count(*) FROM pg_policies;</font> — you should see 47 rows (the RLS "
    "policies)."
))
story.append(P(
    "<b>Step 8.</b> Seed the default topics so the app is not empty on first launch. Run "
    "<font name='DejaVuSans'>supabase/seeds/001_seed_data.sql</font> in the SQL Editor. This inserts "
    "6 default topics (Engineering, Philosophy, Medicine, Business, Art, Science) so new users have "
    "something to follow immediately."
))
story.append(P(
    "<b>Step 9.</b> Run the app locally with <font name='DejaVuSans'>npm run dev</font> and visit "
    "<font name='DejaVuSans'>http://localhost:3000/api/healthz</font>. The JSON response should now "
    "show <font name='DejaVuSans'>\"supabase\":\"configured\"</font> instead of "
    "<font name='DejaVuSans'>\"not-configured\"</font>. If it still says not-configured, double-check "
    "the .env file is being loaded (the server reads it via <font name='DejaVuSans'>api-server/src/lib/config.ts</font>)."
))

story.extend(sub_section("Verification Gate"))
story.append(P(
    "Hit <font name='DejaVuSans'>POST /api/posts</font> with a test post via curl, then "
    "<font name='DejaVuSans'>GET /api/feed</font> and confirm the post comes back. If both work, the "
    "round-trip is functional: the API server is reading and writing to Supabase correctly."
))

story.extend(sub_section("Effort & Risk"))
story.append(P(
    "Effort: 0.5 day (most of it is waiting for Supabase to provision + running SQL). Risk: medium. "
    "The 47 RLS policies in the migration were written defensively (deny by default), so it is possible "
    "a legitimate write gets blocked. If that happens, check the Supabase dashboard's <b>Logs → "
    "Postgres</b> tab — RLS denials show up there with the policy name that blocked the write."
))

# ───────────────────────────────────────────────────────────────────
# CHAPTER 6 — Phase 2: Auth Production
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 6 — Phase 2: Auth Production"))

story.extend(sub_section("Goal"))
story.append(P(
    "Real user sign-up and sign-in. Today the app uses a hardcoded 'mock user' in many components — "
    "that has to end before real users arrive. Firebase Auth is already wired to a real project, but "
    "the sign-in providers are not yet enabled and the client does not yet route unauthenticated users "
    "to a sign-in screen."
))

story.extend(sub_section("Tasks"))

story.append(P(
    "<b>Enable Firebase sign-in providers.</b> In the Firebase Console "
    "(<font name='DejaVuSans'>console.firebase.google.com</font>), open the project "
    "<font name='DejaVuSans'>thin-script-nwh20</font>, go to <b>Authentication → Sign-in method</b>, "
    "and enable: <b>Email/Password</b> (basic), <b>Google</b> (one-tap, requires OAuth consent screen — "
    "configure that in Google Cloud Console), and optionally <b>Phone</b> (requires enabling billing "
    "on the Firebase project, even though the first 50,000 phone auths per month are free)."
))
story.append(P(
    "<b>Add authorized domains.</b> In the same Firebase Auth settings, scroll to <b>Authorized "
    "domains</b> and add your production URL (e.g. <font name='DejaVuSans'>braindrain.app</font>, "
    "<font name='DejaVuSans'>preview-xxx.space-z.ai</font>, etc.). Firebase rejects auth requests from "
    "domains not on this list — a common gotcha."
))
story.append(P(
    "<b>Build a real sign-up page.</b> The current <font name='DejaVuSans'>auth/AuthContext.tsx</font> "
    "already wraps the app in a Firebase auth listener. What is missing is a sign-up / sign-in UI: an "
    "email + password form, a 'Sign in with Google' button, and a 'Forgot password' flow. Use Firebase "
    "Auth SDK's <font name='DejaVuSans'>createUserWithEmailAndPassword</font> and "
    "<font name='DejaVuSans'>signInWithPopup</font> — both are already imported in "
    "<font name='DejaVuSans'>lib/firebase-auth.ts</font>."
))
story.append(P(
    "<b>Replace mock user everywhere.</b> Grep for "
    "<font name='DejaVuSans'>authorName: 'Me'</font> and "
    "<font name='DejaVuSans'>userId: 'me'</font> across the codebase. Each hit is a place that needs to "
    "read from <font name='DejaVuSans'>useAuth()</font> instead. The pattern is in "
    "<font name='DejaVuSans'>hooks/use-social.ts</font> already — replicate it. Expect 8-12 hits."
))
story.append(P(
    "<b>Wire getAuthToken into every API write.</b> <font name='DejaVuSans'>hooks/use-social.ts</font> "
    "already calls <font name='DejaVuSans'>getAuthToken()</font> before "
    "<font name='DejaVuSans'>createPostApi()</font> — that pattern needs to be replicated in "
    "<font name='DejaVuSans'>use-comments.ts</font>, <font name='DejaVuSans'>use-brain-repo.ts</font>, "
    "and the other write hooks. The server's <font name='DejaVuSans'>requireAuth</font> middleware "
    "already rejects requests without a valid token, so this is a client-side fix."
))
story.append(P(
    "<b>Handle 'no token yet' gracefully.</b> When <font name='DejaVuSans'>getAuthToken()</font> returns "
    "null (user not signed in), the write should not silently fail. Either queue it for offline replay "
    "(the existing <font name='DejaVuSans'>queueOfflineAction</font> helper works for this) or show a "
    "sign-in prompt. The choice depends on the action — for posting, prompt; for reactions, queue."
))

story.extend(sub_section("Verification Gate"))
story.append(P(
    "A brand-new user can: (a) open the app, (b) see a sign-in prompt, (c) sign up with email + "
    "password, (d) create a post, (e) sign out, (f) sign back in with the same credentials, (g) see "
    "their post still in the feed. If all 7 steps work, auth is production-grade."
))

story.extend(sub_section("Effort & Risk"))
story.append(P(
    "Effort: 1.5 days (most of it is the sign-up UI + replacing mock-user hits). Risk: low. Firebase "
    "Auth handles the hard parts (password hashing, session management, token refresh, OAuth flow). "
    "The main risk is forgetting to replace a mock-user hit somewhere — the grep-and-replace pass catches "
    "those."
))

# ───────────────────────────────────────────────────────────────────
# CHAPTER 7 — Phase 3: Topic-Based People You May Know
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 7 — Phase 3: Topic-Based 'People You May Know'"))

story.extend(sub_section("Goal"))
story.append(P(
    "Simplest discovery method: zero permissions, zero PII, zero friction. New users see people who "
    "follow the same topics they follow. This is the same pattern Twitter and Reddit use for cold-start "
    "follow recommendations, and it works because topic-follow is already a public, low-stakes signal."
))

story.extend(sub_section("Tasks"))

story.append(P(
    "<b>Server endpoint.</b> Add <font name='DejaVuSans'>GET /api/discover/by-topics</font> in a new "
    "file <font name='DejaVuSans'>api-server/src/routes/discover.ts</font>. The SQL is one query: "
    "<font name='DejaVuSans'>SELECT user_id, COUNT(*) as overlap FROM topic_followers WHERE topic_id "
    "IN (SELECT topic_id FROM topic_followers WHERE user_id = $me) AND user_id != $me GROUP BY "
    "user_id ORDER BY overlap DESC LIMIT 20</font>. Returns up to 20 user IDs with their overlap count "
    "and a join to <font name='DejaVuSans'>profiles</font> for display name + avatar."
))
story.append(P(
    "<b>Client hook.</b> Add <font name='DejaVuSans'>useDiscoverByTopics()</font> in "
    "<font name='DejaVuSans'>hooks/use-discover.ts</font>. Uses TanStack Query, 30-second stale time, "
    "calls the new endpoint. Returns the list of suggested users + a follow mutation that calls the "
    "existing <font name='DejaVuSans'>POST /api/follow</font> endpoint."
))
story.append(P(
    "<b>UI component.</b> Add <font name='DejaVuSans'><PeopleYouMayKnow /></font> in "
    "<font name='DejaVuSans'>feed/PeopleYouMayKnow.tsx</font>. Renders a horizontal scroll of user "
    "cards (avatar, name, follow button). One card per suggested user. Click the follow button to follow "
    "instantly; the card disappears from the list on success."
))
story.append(P(
    "<b>Placement.</b> Show the component on the homepage sidebar (or above the feed on mobile) for "
    "users whose followerCount is less than 5. Once a user has 5+ followers, they have enough social "
    "graph that the discovery widget is no longer the highest-value use of homepage real estate — hide "
    "it and let the feed take over."
))

story.extend(sub_section("Verification Gate"))
story.append(P(
    "New user signs up, follows 2 topics, navigates to homepage, sees at least 5 suggested users "
    "in the People You May Know widget. Clicking follow on one user removes them from the list and "
    "increments that user's follower count."
))

story.extend(sub_section("Effort & Risk"))
story.append(P(
    "Effort: 0.5 day. Risk: low — single SQL query, single client hook, single component. The only "
    "edge case is when a new user follows 0 topics; in that case the widget shows nothing (which is "
    "fine — Phase 5's pre-populated feed handles that case)."
))

# ───────────────────────────────────────────────────────────────────
# CHAPTER 8 — Phase 4: Username Search
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 8 — Phase 4: Username Search (Autocomplete)"))

story.extend(sub_section("Goal"))
story.append(P(
    "Users can find anyone by typing @username. This is the lowest-friction discovery method for users "
    "who already know whom they are looking for — they type a few letters, get a dropdown, click to "
    "follow. No permissions, no PII, no waiting for sync."
))

story.extend(sub_section("Tasks"))

story.append(P(
    "<b>Database index.</b> The <font name='DejaVuSans'>profiles</font> table already has a "
    "<font name='DejaVuSans'>username</font> column (it is in the migration). Add a GIN trigram index "
    "for fast substring search: run <font name='DejaVuSans'>CREATE EXTENSION IF NOT EXISTS pg_trgm; "
    "CREATE INDEX profiles_username_trgm ON profiles USING GIN (username gin_trgm_ops);</font> in the "
    "Supabase SQL Editor. Trigram indexes give sub-100ms substring search even on a million rows."
))
story.append(P(
    "<b>Server endpoint.</b> Add <font name='DejaVuSans'>GET /api/discover/search?q=alice&limit=10</font> "
    "in the same <font name='DejaVuSans'>routes/discover.ts</font> file. SQL: "
    "<font name='DejaVuSans'>SELECT id, username, display_name, avatar_url FROM profiles WHERE "
    "username ILIKE '%' || $1 || '%' ORDER BY similarity(username, $1) DESC LIMIT $2</font>. The "
    "<font name='DejaVuSans'>similarity()</font> function comes from pg_trgm and ranks by trigram "
    "overlap — so 'ali' matches 'alice' higher than 'malibu'."
))
story.append(P(
    "<b>Client component.</b> Add <font name='DejaVuSans'><UserSearch /></font> in "
    "<font name='DejaVuSans'>feed/UserSearch.tsx</font>. A text input with a debounced (200ms) onChange "
    "handler that calls the search endpoint. Results show as a dropdown of user rows (avatar, username, "
    "follow button). Click outside to dismiss. Empty query clears the dropdown."
))
story.append(P(
    "<b>Wire into SearchPage.</b> Extend <font name='DejaVuSans'>pages/SearchPage.tsx</font> with a "
    "new <b>People</b> tab (alongside the existing posts/topics tabs). When the user is on the People "
    "tab, the search input uses <font name='DejaVuSans'><UserSearch /></font>; on the other tabs "
    "it uses the existing search."
))

story.extend(sub_section("Verification Gate"))
story.append(P(
    "Type 'ali' in the user search — within 200ms a dropdown appears with all users whose username "
    "contains 'ali', ranked by similarity. Click follow on one — the button changes to 'Following' "
    "and the user's follower count increments."
))

story.extend(sub_section("Effort & Risk"))
story.append(P(
    "Effort: 0.5 day. Risk: low. The pg_trgm extension is included in Supabase by default. The only "
    "edge case is very short queries (1-2 characters) returning too many results — handle that by "
    "requiring at least 3 characters before querying."
))

# ───────────────────────────────────────────────────────────────────
# CHAPTER 9 — Phase 5: Pre-Populated Feed
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 9 — Phase 5: Pre-Populated Feed (Kills Blank Homepage)"))

story.extend(sub_section("Goal"))
story.append(P(
    "Brand-new users never see an empty feed. The number-one UX failure of social apps is the 'blank "
    "homepage on first launch' — a new user signs up, follows nobody, sees nothing, and leaves. This "
    "phase closes that hole permanently."
))

story.extend(sub_section("Tasks"))

story.append(P(
    "<b>Server endpoint.</b> Add <font name='DejaVuSans'>GET /api/feed/cold-start</font> in "
    "<font name='DejaVuSans'>routes/feed.ts</font>. Returns 20 curated posts: top posts from the last "
    "7 days across all topics, sorted by (upvotes * 1.0) + (comment_count * 0.5) + (recency_bonus). "
    "The recency bonus is <font name='DejaVuSans'>ln(720 - hours_old)</font> capped at 0, so a "
    "1-hour-old post gets +6.5 points and a 30-day-old post gets 0. This blends popularity with "
    "freshness."
))
story.append(P(
    "<b>Mixing logic.</b> In <font name='DejaVuSans'>hooks/use-social.ts</font>, after the existing "
    "feed fetch, check: if the returned post count is less than 10 AND the user follows fewer than 5 "
    "topics, fetch <font name='DejaVuSans'>/api/feed/cold-start</font> and merge. Mix ratio 50/50 — half "
    "the user's actual feed, half cold-start posts. Deduplicate by post ID."
))
story.append(P(
    "<b>Seed starter content.</b> Before launch, manually create 12 high-quality starter posts across "
    "the 6 default topics (2 per topic). These should be real, useful posts — sample brains, interesting "
    "questions, helpful answers — not lorem ipsum. They become the cold-start pool for the first week "
    "until organic content overtakes them."
))
story.append(P(
    "<b>UI banner.</b> When the cold-start posts are being mixed in, show a dismissible banner at the "
    "top of the feed: 'Discovering posts for you — follow topics to personalize.' The banner disappears "
    "once the user follows 3+ topics or dismisses it explicitly (store the dismissal in localStorage)."
))

story.extend(sub_section("Verification Gate"))
story.append(P(
    "Brand-new user signs up, follows 0 topics, navigates to homepage. Sees 20 posts (not blank). "
    "Banner reads 'Discovering posts for you'. User follows 3 topics, refreshes — banner disappears, "
    "feed now shows posts from those topics mixed with cold-start."
))

story.extend(sub_section("Effort & Risk"))
story.append(P(
    "Effort: 1 day. Risk: low. The main risk is the cold-start content being low quality, which makes "
    "the app look dead on first impression. Mitigate by spending an hour curating the 12 starter posts "
    "before launch — this is the single highest-leverage content task in the entire roadmap."
))

# ───────────────────────────────────────────────────────────────────
# CHAPTER 10 — Phase 6: Phone Contact Sync
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 10 — Phase 6: Phone Contact Sync (Zero-Cost, Consent-First)"))

story.extend(sub_section("Goal"))
story.append(P(
    "User picks contacts from their phone, we hash + match server-side. Zero-cost: no third-party SMS "
    "provider, no paid contact API. The Contact Picker API is free, native, and requires explicit "
    "user consent per session — which is exactly the privacy posture we want."
))

story.extend(sub_section("Architecture"))

story.append(P(
    "<b>Mobile browsers (Chrome Android, Safari iOS 14.7+).</b> Use the Contact Picker API: "
    "<font name='DejaVuSans'>navigator.contacts.select(['name', 'tel'], {multiple: true})</font>. This "
    "opens the OS-native contact picker. The user explicitly taps each contact they want to share. "
    "There is no silent background sync, no 'upload all contacts' button — every share is a deliberate "
    "user action."
))
story.append(P(
    "<b>Desktop fallback.</b> Desktop browsers do not support the Contact Picker API. Provide a "
    "'Upload contacts file' option that accepts a vCard (.vcf) or CSV exported from Google Contacts / "
    "Apple Contacts / Outlook. Parse the file client-side with a small vCard parser (a 100-line regex "
    "extraction of TEL fields). Same consent model: user explicitly picks the file."
))
story.append(P(
    "<b>Hashing (privacy).</b> For each selected contact, normalize the phone number "
    "(strip spaces, dashes, parens; convert to E.164 with the user's country code), then SHA-256 hash "
    "with a per-user salt. The salt is generated client-side on first launch and stored in "
    "IndexedDB. The server never sees raw phone numbers — only the salted hash."
))
story.append(P(
    "<b>Server endpoint.</b> Add <font name='DejaVuSans'>POST /api/discover/by-contacts</font> in "
    "<font name='DejaVuSans'>routes/discover.ts</font>. Accepts an array of phone hashes + the user's "
    "salt. Server-side: lookup each hash against a <font name='DejaVuSans'>profiles.phone_hash</font> "
    "column (new — add via migration), returns matching profiles. Add the "
    "<font name='DejaVuSans'>phone_hash</font> column to the profiles table: "
    "<font name='DejaVuSans'>ALTER TABLE profiles ADD COLUMN phone_hash text; CREATE INDEX "
    "profiles_phone_hash_idx ON profiles(phone_hash);</font>."
))
story.append(P(
    "<b>Profile setup.</b> When a user signs up with phone auth (Phase 2), compute their own "
    "phone_hash with their salt and store it in their profile. When they later run contact sync, "
    "their hash matches other users who also signed up with phone auth. Users who signed up with "
    "email/password only are not matchable via phone — that is fine, they can still be found via "
    "topic-based suggestions (Phase 3) or username search (Phase 4)."
))
story.append(P(
    "<b>UI.</b> 'Find friends from your contacts' button on the homepage, in the same row as the "
    "topic-based suggestions. On click: detect browser support, open the appropriate picker, show a "
    "loading spinner, then a results screen with matched users and follow buttons. Show a privacy "
    "explanation modal before the picker opens: 'We never see or store your raw contacts. We only "
    "store a one-way hash that lets us match you with people you already know.'"
))

story.extend(sub_section("Verification Gate"))
story.append(P(
    "On Chrome Android: tap 'Find friends from contacts', grant permission, pick 5 contacts, see 2+ "
    "matched users. On desktop: tap 'Find friends from contacts', upload a vCard with 5 entries, see "
    "matched users. Both paths show the privacy modal before the picker opens."
))

story.extend(sub_section("Effort & Risk"))
story.append(P(
    "Effort: 2 days (1 day for the Contact Picker + vCard parsing, 0.5 day for the hashing + server "
    "endpoint, 0.5 day for the UI + privacy modal). Risk: medium. The Contact Picker API has roughly "
    "85% browser support (no Firefox, no Safari on iOS below 14.7); the vCard fallback covers the "
    "remaining 15% but has parsing edge cases. The privacy model is sound as long as the salt is "
    "generated client-side and never sent to the server in clear."
))

# ───────────────────────────────────────────────────────────────────
# CHAPTER 11 — Phase 7: Google Email OAuth
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 11 — Phase 7: Google Email OAuth (People API)"))

story.extend(sub_section("Goal"))
story.append(P(
    "User signs in with Google, we get their email contacts (with consent). Zero-cost: Google People "
    "API is free for read-only contact access up to 2,000 contacts per user. This is the same pattern "
    "Facebook and LinkedIn use for 'find friends from your email' — except we never store the raw "
    "emails, only salted hashes."
))

story.extend(sub_section("Architecture"))

story.append(P(
    "<b>Extend Firebase Auth scope.</b> When the user picks 'Sign in with Google' in Phase 2's "
    "sign-in page, request the additional scope "
    "<font name='DejaVuSans'>https://www.googleapis.com/auth/contacts.readonly</font>. Firebase Auth "
    "supports this via the <font name='DejaVuSans'>provider.addScope()</font> call before "
    "<font name='DejaVuSans'>signInWithPopup</font>. The user sees a Google consent screen listing "
    "exactly what we will read (their email, their profile, and their contacts' email addresses)."
))
story.append(P(
    "<b>Get Google access token.</b> After sign-in, Firebase provides a Google OAuth access token "
    "via <font name='DejaVuSans'>getAccessToken(true)</font> (the <font name='DejaVuSans'>true</font> "
    "forces a refresh, ensuring the token has the contacts.readonly scope). This token is good for 1 "
    "hour; refresh as needed."
))
story.append(P(
    "<b>Call Google People API.</b> "
    "<font name='DejaVuSans'>GET https://people.googleapis.com/v1/people/me/connections?personFields=emailAddresses&pageSize=2000</font> "
    "with the access token in the Authorization header. Returns up to 2,000 of the user's contacts "
    "with their email addresses. Handle pagination via the <font name='DejaVuSans'>nextPageToken</font> "
    "field if the user has more than 2,000 contacts."
))
story.append(P(
    "<b>Hash + match.</b> For each contact email, lowercase + trim, then SHA-256 hash with the same "
    "per-user salt used for phone contacts (Phase 6). POST the array of hashes to "
    "<font name='DejaVuSans'>POST /api/discover/by-emails</font>. Server matches against "
    "<font name='DejaVuSans'>profiles.email_hash</font> (new column, same pattern as phone_hash). "
    "Returns matched profiles."
))
story.append(P(
    "<b>Profile setup.</b> When a user signs up with email/password or Google, compute their own "
    "email_hash with their salt and store it in their profile. Google sign-in users are matchable via "
    "their verified Google email; email/password users are matchable via their signup email."
))
story.append(P(
    "<b>UI.</b> 'Find Gmail friends' button next to the contact-sync button. On click: if user is "
    "already signed in with Google, fetch contacts immediately; if not, trigger Google sign-in with "
    "the contacts.readonly scope. Show a consent modal first explaining: 'We will read your Google "
    "contacts to find people you already know on Brain Drain. We never store your raw emails — only "
    "a one-way hash.' After the user agrees, show a loading spinner, then the matched-users screen."
))

story.extend(sub_section("Verification Gate"))
story.append(P(
    "User signs in with Google, taps 'Find Gmail friends', sees the consent modal, agrees, sees 5+ "
    "matched users within 5 seconds. User can revoke Google contacts access at any time from the "
    "Google Account security page (link to it from Brain Drain's settings page)."
))

story.extend(sub_section("Effort & Risk"))
story.append(P(
    "Effort: 2 days. Risk: medium. The OAuth scope approval process for unverified apps can take 2-4 "
    "weeks; for personal projects with fewer than 100 users Google auto-approves. Start the "
    "verification process on day 1 of this phase so it runs in parallel with the development work. "
    "If verification is still pending when the phase is code-complete, ship it behind a feature flag "
    "for the first 100 users (Google allows unverified apps for up to 100 test users)."
))

# ───────────────────────────────────────────────────────────────────
# CHAPTER 12 — Phase 8: Production Hardening
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 12 — Phase 8: Production Hardening"))

story.extend(sub_section("Goal"))
story.append(P(
    "The app can handle real traffic safely. The prior phases made it work; this phase makes it "
    "survive. Hardening is the difference between 'works on my machine with 1 user' and 'works in "
    "production with 1000 concurrent users and a misbehaving client'."
))

story.extend(sub_section("Tasks"))

story.append(P(
    "<b>Backups.</b> Enable Supabase's automated daily backups (free tier keeps 7 days of PITR — "
    "point-in-time recovery). Add a manual pg_dump cron script that runs nightly, gzips the dump, "
    "and uploads to a free Backblaze B2 bucket (10 GB free, enough for years of nightly dumps). The "
    "script is already drafted at <font name='DejaVuSans'>scripts/backup-supabase.sh</font> — fill in "
    "the B2 credentials and test it end-to-end."
))
story.append(P(
    "<b>Rate limiting.</b> The rate limiter is already implemented in "
    "<font name='DejaVuSans'>api-server/src/lib/rate-limit.ts</font>. Verify the limits: 100 requests "
    "per minute per IP for read endpoints (feed, posts, search), 10 requests per minute per IP for "
    "write endpoints (create post, react, comment). These numbers are conservative enough to absorb "
    "a misbehaving client without blocking legitimate users."
))
story.append(P(
    "<b>Sentry error tracking.</b> The <font name='DejaVuSans'>.env.example</font> already documents "
    "<font name='DejaVuSans'>SENTRY_DSN</font>. Sign up at sentry.io (free tier = 5,000 errors/month), "
    "create a project, copy the DSN into .env. The client-side error reporter is already wired via "
    "<font name='DejaVuSans'>/api/client-errors</font>; just point it at Sentry. Server-side: add the "
    "Sentry Node SDK to <font name='DejaVuSans'>api-server/src/index.ts</font> as the "
    "<font name='DejaVuSans'>uncaughtException</font> and <font name='DejaVuSans'>unhandledRejection</font> "
    "handler."
))
story.append(P(
    "<b>Load test.</b> The k6 load-test script is already drafted at "
    "<font name='DejaVuSans'>scripts/load-test.js</font>. Run it with 100 virtual users for 5 minutes "
    "against a staging deployment. Target: p95 latency under 500ms, error rate under 0.1%. If the "
    "target is missed, the bottleneck is almost always the Supabase connection pool — bump it from "
    "the default 15 to 50 in the Supabase dashboard (Settings → Database → Connection pool)."
))
story.append(P(
    "<b>CI/CD.</b> The workflow at <font name='DejaVuSans'>.github/workflows/ci.yml</font> already "
    "runs typecheck + tests + build on every push. Add a deploy step: on push to main, after the "
    "test job passes, deploy to Render via Render's deploy hook URL (stored as a GitHub Actions "
    "secret). This gives one-click rollback via GitHub's 'Revert' button."
))
story.append(P(
    "<b>Monitoring.</b> The <font name='DejaVuSans'>/api/ready</font> endpoint already exists and "
    "checks Supabase connectivity. Add it to Render's health check (Settings → Health Check "
    "Path = <font name='DejaVuSans'>/api/ready</font>) so Render auto-restarts the service if it "
    "stops responding. Add an uptime monitor (UptimeRobot free tier = 50 monitors) hitting "
    "<font name='DejaVuSans'>/api/healthz</font> every 5 minutes — get an email if it goes down."
))
story.append(P(
    "<b>Runbook.</b> <font name='DejaVuSans'>RUNBOOK.md</font> already exists with SEV1-3 incident "
    "response procedures. Review it with the real Supabase + Firebase specifics: Supabase dashboard "
    "URL, Firebase project ID, Render service URL, Sentry project URL, B2 bucket name. Add the "
    "rotation schedule for who is on-call (even if it is just you for now — the structure matters "
    "more than the headcount)."
))

story.extend(sub_section("Verification Gate"))
story.append(P(
    "Load test passes at 100 concurrent users with p95 latency under 500ms and error rate under 0.1%. "
    "Sentry captures a deliberate test error. Backup script runs successfully and the dump restores "
    "to a fresh Supabase project. CI/CD pipeline deploys on a test push to main. UptimeRobot shows "
    "the service as up."
))

story.extend(sub_section("Effort & Risk"))
story.append(P(
    "Effort: 2.5 days. Risk: low — every task is adding monitoring/backup to a working system, not "
    "changing behavior. The biggest risk is forgetting to test the backup restore — an untested "
    "backup is no backup."
))

# ───────────────────────────────────────────────────────────────────
# CHAPTER 13 — Effort, Sequence & Critical Path
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 13 — Effort, Sequence & Critical Path"))

story.append(P(
    "The full roadmap is roughly 12 working days for one engineer. The critical path — the shortest "
    "sequence that gets the app to a launchable state — is just 6 days: Phase 0 (cleanup), Phase 1 "
    "(Supabase), Phase 2 (auth), Phase 8 (hardening). The discovery phases (3 through 7) can ship "
    "incrementally after launch without blocking go-live."
))

effort_data = [
    ["Phase", "Effort", "Cumulative", "Critical Path?"],
    ["0 — Audit + Cleanup", "1.5d", "1.5d", "YES"],
    ["1 — Supabase Live", "0.5d", "2.0d", "YES"],
    ["2 — Auth Production", "1.5d", "3.5d", "YES"],
    ["3 — Topic Suggestions", "0.5d", "4.0d", "no (parallel)"],
    ["4 — Username Search", "0.5d", "4.5d", "no (parallel)"],
    ["5 — Pre-populated Feed", "1.0d", "5.5d", "no (parallel)"],
    ["6 — Phone Contact Sync", "2.0d", "7.5d", "no (parallel)"],
    ["7 — Google Email OAuth", "2.0d", "9.5d", "no (parallel)"],
    ["8 — Production Hardening", "2.5d", "12.0d", "YES"],
]

story.extend(std_table(
    effort_data,
    col_widths=[180, 60, 80, 110],
    caption="Table 3 — Effort per phase. Cumulative assumes serial execution; parallel cuts total time."
))

story.append(callout_box(
    "<b>Critical path = Phase 0 → 1 → 2 → 8 = ~6 days minimum.</b> Phases 3-7 (the "
    "discovery features) can be added incrementally after launch without blocking go-live. If you are "
    "under time pressure, ship the critical path first, then layer in discovery features as you have "
    "time. The app is launchable after Phase 2 — everything else is enhancement."
))

# ───────────────────────────────────────────────────────────────────
# CHAPTER 14 — Risks & Mitigations
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 14 — Risks & Mitigations"))

story.append(P(
    "Six risks deserve explicit attention. None of them are blockers, but each has a specific "
    "mitigation that should be planned in advance rather than improvised under pressure."
))

risks_data = [
    ["Risk", "Likelihood", "Mitigation"],
    ["Supabase free tier (500 MB DB) runs out",
     "Medium at 1k users",
     "Monitor usage in Supabase dashboard. Upgrade to Pro tier ($25/mo) when DB usage crosses 70%. Pro includes 8 GB."],
    ["Firebase Auth free tier (50k MAU) runs out",
     "Low",
     "Free tier covers the first 50,000 monthly active users. Monitor in Firebase Console. Pricing scales linearly past that."],
    ["Contact Picker API browser support ~85%",
     "Medium",
     "vCard / CSV upload is the fallback for Firefox + iOS Safari below 14.7. Detect support with `('contacts' in navigator)` and show the appropriate UI."],
    ["Google OAuth scope approval takes 2-4 weeks",
     "High for verified apps",
     "Start verification on Phase 7 day 1. Ship behind feature flag for first 100 test users (Google auto-allows this)."],
    ["Cold-start feed quality is low",
     "Medium",
     "Curate 12 high-quality starter posts BEFORE launch. Spend an hour on this — it is the single highest-leverage content task in the roadmap."],
    ["PII (phone/email) handling",
     "Low (design-time)",
     "Server stores only SHA-256 hashes with per-user salt. Raw phone/email never leaves the client. Privacy policy page already live at /privacy-policy."],
]

story.extend(std_table(
    risks_data,
    col_widths=[160, 85, 230],
    caption="Table 4 — Risks and their mitigations. None are blockers; all are plannable."
))

# ───────────────────────────────────────────────────────────────────
# CHAPTER 15 — Launch Checklist & Next Action
# ───────────────────────────────────────────────────────────────────
story.extend(major_section("Chapter 15 — Launch Checklist & Next Action"))

story.append(P(
    "The checklist below is the single source of truth for launch readiness. Each item is binary — "
    "done or not done. The app is launchable when every box is checked."
))

checklist_data = [
    ["#", "Item", "Status"],
    ["1", "typecheck: 0 errors", "DONE"],
    ["2", "tests: 37/37 PASS", "DONE"],
    ["3", "build: PASS", "DONE"],
    ["4", "Supabase project created + migration deployed", "TODO"],
    ["5", "Firebase Auth providers enabled (Email + Google)", "TODO"],
    ["6", ".env vars set locally + on hosting provider", "TODO"],
    ["7", "Cold-start feed seeded (12 starter posts)", "TODO"],
    ["8", "Privacy policy live", "DONE"],
    ["9", "Terms of service live", "DONE"],
    ["/api/ready returns 200", "/api/ready returns 200", "DONE"],
    ["11", "Sentry error tracking wired", "TODO"],
    ["12", "Backup script tested end-to-end", "TODO"],
    ["13", "Load test passes at 100 concurrent users", "TODO"],
    ["14", "RUNBOOK.md updated with real URLs", "TODO"],
    ["15", "Demo user flow tested (signup → post → comment → signout → signin)", "TODO"],
]

# Replace the row that has invalid data
checklist_data[10] = ["10", "/api/ready returns 200", "DONE"]

story.extend(std_table(
    checklist_data,
    col_widths=[30, 350, 70],
    caption="Table 5 — Launch checklist. 5 of 15 items done; 10 remain across Phases 1, 2, 5, and 8."
))

story.append(P(
    "The next action is to pick a phase to start. Recommendation: <b>Phase 0 (cleanup) first</b> "
    "because it is the safest, lowest-risk phase and unblocks everything else. It can be completed "
    "in a single day, leaves the codebase in a verifiably better state, and gives a clean foundation "
    "for the Supabase walk-through in Phase 1."
))

story.append(P(
    "Say the word and I will begin Phase 0 immediately: triage the 299 TODO markers, remove the dead "
    "code, run the full verification gate, and commit. No regressions, no big-bang changes, no "
    "surprises — just forward progress on a clean base."
))

# ── Build ──────────────────────────────────────────────────────────
OUTPUT = "/home/z/my-project/download/brain-drain-roadmap-body.pdf"

doc = TocDocTemplate(
    OUTPUT,
    pagesize=A4,
    leftMargin=LEFT_MARGIN, rightMargin=RIGHT_MARGIN,
    topMargin=TOP_MARGIN, bottomMargin=BOTTOM_MARGIN,
    title="Brain Drain — Production Roadmap",
    author="Z.ai",
    creator="Z.ai",
    subject="Zero-to-launch engineering plan: backend, auth, discovery, hardening",
)

doc.multiBuild(story, onFirstPage=draw_page_footer, onLaterPages=draw_page_footer)
print(f"Body PDF written: {OUTPUT}")
