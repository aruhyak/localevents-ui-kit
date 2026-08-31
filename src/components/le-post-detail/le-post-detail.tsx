import { Component, Prop, State, Event, EventEmitter, h, Host, Listen } from '@stencil/core';
import type { Post, EventPost, RequestPost, OfferPost, Thread } from '@le/shared';
import {
  formatDistance, formatWhen, formatRange, formatDailyRun, formatWeekly, untilOf,
  requiresLicence, isSaved, toggleSave, lifecycle,
  threadsOn, threadFor, addReply, canSeeContact, contactHint, updateLocalPost,
  imageFor,
} from '@le/shared';

/**
 * The full post, opened by tapping a card.
 *
 * The card is a summary — three lines of description, no photo — because a
 * feed of full posts is unscannable. Everything that does not fit there lives
 * here: the whole description, the photo at full width, the exact place, and
 * the actions.
 *
 * A page by default (fullPage), because a sheet cannot be linked to, cannot be
 * dismissed with the phone's back gesture, and leaves the page behind it
 * half-visible. The cost of a page — losing your place in the feed — is paid
 * off by the shell remembering the scroll position instead.
 */
/**
 * What has actually been checked about this person, in words.
 *
 * The badges say what was verified. This says what was NOT, which is the half
 * someone weighs when deciding whether to let a stranger into their house —
 * and the half a row of ticks quietly omits.
 */
function authorProof(a: { idVerified: boolean; phoneVerified?: boolean }): string {
  if (a.idVerified && a.phoneVerified) return 'ID and phone confirmed';
  if (a.idVerified) return 'ID confirmed · no phone on file';
  if (a.phoneVerified) return 'Phone confirmed · ID not checked';
  return 'Nothing verified yet';
}

@Component({
  tag: 'le-post-detail',
  styleUrl: 'le-post-detail.css',
  shadow: true,
})
export class LePostDetail {
  @Prop() post!: Post;

  /**
   * Render as a page rather than a sheet.
   *
   * A prop rather than a separate component: everything inside — the
   * conversation, the contact gate, the save button — is identical, and only
   * the frame differs. Two components would mean fixing the phone-number rule
   * twice.
   */
  @Prop() fullPage = false;
  @Prop() distanceKm = 0;
  /** Who is looking. Decides whether the poster's number is shown. */
  @Prop() viewerId = '';
  @Prop() viewerName = '';
  /** Whether the viewer is ID-verified, recorded on anything they write. */
  @Prop() viewerVerified = false;
  /** Whether you have confirmed a phone number, stamped onto what you write. */
  @Prop() viewerPhoneVerified = false;

  @State() saved = false;
  @State() threads: Thread[] = [];
  /** One draft per conversation, keyed by the helper's id. */
  @State() drafts: Record<string, string> = {};
  @State() working = false;
  /** Local copy, so choosing someone re-renders without a round trip. */
  @State() live: Post | null = null;

  @Event({ eventName: 'le:close-post', bubbles: true, composed: true })
  closePost!: EventEmitter<void>;

  @Event({ eventName: 'le:toggle-save', bubbles: true, composed: true })
  toggleSaved!: EventEmitter<{ id: string; saved: boolean }>;

  componentWillLoad() {
    this.saved = isSaved(this.post.id);
    this.live = this.post;
    this.load();
  }

  /** The post as it stands now — the prop is a snapshot from before a claim. */
  private get current(): Post {
    return this.live ?? this.post;
  }

  private get isOwner(): boolean {
    return !!this.viewerId && this.current.author.id === this.viewerId;
  }

  /**
   * The poster sees every conversation on their post; anyone else sees only
   * their own. Filtering here rather than in the template keeps the rule in
   * one place — it is the same rule that decides what leaks.
   */
  private load() {
    const all = threadsOn(this.post.id);
    this.threads = this.isOwner
      ? all
      : all.filter((t) => t.helperId === this.viewerId);
  }

  private setDraft(helperId: string, value: string) {
    this.drafts = { ...this.drafts, [helperId]: value };
  }

  /** Offering to help — the message that opens a conversation. */
  private offerHelp = () => {
    const message = (this.drafts[this.viewerId] ?? '').trim();
    if (!message || this.working) return;
    this.working = true;
    addReply({
      postId: this.post.id,
      authorId: this.viewerId,
      displayName: this.viewerName || 'Someone nearby',
      message,
      idVerified: this.viewerVerified,
      phoneVerified: this.viewerPhoneVerified,
    });
    this.setDraft(this.viewerId, '');
    this.load();
    this.working = false;
  };

  /**
   * Pick one person. This is what releases the number to them, so it is a
   * deliberate act with a confirm rather than a tap that could happen by
   * accident while scrolling a list of replies.
   */
  private choose = (t: Thread) => {
    const ok = confirm(
      `Choose ${t.helperName}?\n\nThey'll be able to see your phone number. ` +
      `Nobody else who replied will.`,
    );
    if (!ok) return;
    const next: RequestPost = {
      ...(this.current as RequestPost),
      claimState: 'claimed',
      claimedBy: t.helperId,
    };
    updateLocalPost(next);
    this.live = next;
  };

  /** Escape goes back, like every other dismissible layer in the app. */
  @Listen('keydown', { target: 'document' })
  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') this.close();
  }

  private close = () => this.closePost.emit();

  private onSave = () => {
    // Trust the store's answer, not our own optimism — a save can fail on
    // quota, and the button must show what actually persisted.
    this.saved = toggleSave(this.post.id);
    this.toggleSaved.emit({ id: this.post.id, saved: this.saved });
  };

  private whenLine(): string | null {
    const p = this.post;
    if (p.kind === 'event') {
      const e = p as EventPost;
      const until = untilOf(e.rrule);
      if (until !== null) return formatDailyRun(e.startsAt, e.endsAt, until);
      // A weekly listing is described by the day it recurs on, not by the date
      // of one occurrence.
      const weekly = formatWeekly(e.rrule, e.startsAt);
      if (weekly) return weekly;
      return e.endsAt ? formatRange(e.startsAt, e.endsAt) : formatWhen(e.startsAt);
    }
    if (p.kind === 'request') return formatWhen((p as RequestPost).neededFrom);
    return null;
  }

  private priceLine(): string | null {
    const p = this.post;
    if (p.kind === 'request') {
      const r = p as RequestPost;
      return r.budget ? `Budget $${r.budget}` : null;
    }
    if (p.kind === 'offer') {
      const o = p as OfferPost;
      return o.rate ? `$${o.rate}/${o.rateUnit ?? 'job'}` : null;
    }
    const e = p as EventPost;
    return e.price ? `$${e.price}` : null;
  }

  /** Only offers state availability, and only they have it to state. */
  private availability(): string | null {
    return this.post.kind === 'offer' ? (this.post as OfferPost).availability : null;
  }


  /**
   * The part that matters for a help request: replies, choosing one, and the
   * number that choosing releases.
   *
   * The poster sees who offered and picks one. Everyone else sees either a way
   * to offer, or — once someone has been chosen — that it is taken. Only the
   * chosen person is shown the number.
   */
  /**
   * One person who got in touch — a row, not a conversation.
   *
   * The post used to expand every thread inline, which turned it into a group
   * chat it is not: what one neighbour wrote sat next to what another did, and
   * a busy post became a wall. A conversation is between two people, so the
   * post summarises and the talking happens on its own page.
   */
  private renderPerson(t: Thread, canChoose: boolean, chosen: boolean) {
    const last = t.last;
    const mine = last.authorId === this.viewerId;
    // On your OWN post the other party is the helper. On someone else's, the
    // helper is you — so the person to name is the poster. Without this it
    // listed you talking to yourself.
    const isMe = t.helperId === this.viewerId;
    const other = isMe ? this.current.author.displayName : t.helperName;
    const otherVerified = isMe ? this.current.author.idVerified : t.helperVerified;
    const otherPhone = isMe
      ? this.current.author.phoneVerified === true
      : t.helperPhoneVerified;
    return (
      <div class={{ person: true, chosen }} key={t.helperId}>
        <a
          class="person-open"
          href={`#/thread?post=${encodeURIComponent(t.postId)}&with=${encodeURIComponent(t.helperId)}`}
        >
          <span class="person-top">
            <span class="person-who">{other}</span>
            {/* Beside the name, because "who is this" is the question being
                asked at that moment — not after opening the conversation. */}
            <le-badges idVerified={otherVerified} phoneVerified={otherPhone} size="sm" />
            {chosen ? <span class="tag">Chosen</span> : null}
            <span class="person-n">{t.messages.length}</span>
          </span>
          <span class="person-last">
            {mine ? <span class="person-you">You: </span> : null}
            {last.message}
          </span>
        </a>
        {canChoose ? (
          <button class="pick" type="button" onClick={() => this.choose(t)}>
            Choose {other.split(' ')[0]}
          </button>
        ) : null}
      </div>
    );
  }

  /**
   * Conversations, and — on a request — the number that choosing releases.
   *
   * Works for both kinds, because a thread is just (post, other person) and
   * that shape does not care which way round the favour goes:
   *   request  someone needs a hand; neighbours offer  → poster picks one
   *   offer    someone does this for a living; neighbours enquire → no picking
   *
   * The post's author sees every conversation on it and can answer any. Anyone
   * else sees only their own, or a way to start one.
   */
  private renderConversation() {
    const r = this.current as RequestPost;
    const isRequest = this.current.kind === 'request';
    const mine = this.isOwner;
    // Only a request gets claimed. An offer is a standing advert — a plumber
    // does not stop existing because one person booked them.
    const open = !isRequest || r.claimState === 'open';
    const myThread = mine ? null : threadFor(r.id, this.viewerId);
    const showNumber = isRequest && canSeeContact(r, this.viewerId);
    const hint = isRequest ? contactHint(r, this.viewerId) : null;
    const chosenName = this.threads.find((t) => t.helperId === r.claimedBy)?.helperName;

    return (
      <section class="req">
        {showNumber ? (
          <div class={{ contact: true, own: mine }}>
            <p class="contact-k">{mine ? 'Your number on this post' : 'They shared their number'}</p>
            <a class="contact-v" href={`tel:${r.contactPhone!.replace(/[^\d+]/g, '')}`}>
              {r.contactPhone}
            </a>
            {mine ? (
              <p class="contact-note">
                Only {chosenName ?? 'the person you choose'} can see this.
              </p>
            ) : null}
          </div>
        ) : hint ? (
          <p class="locked">
            <span class="lock" aria-hidden="true">🔒</span> {hint}
          </p>
        ) : null}

        {mine ? (
          <div class="replies">
            <h3 class="req-h">
              {this.threads.length === 0
                ? isRequest ? 'No replies yet' : 'Nobody has been in touch yet'
                : `${this.threads.length} ${this.threads.length === 1 ? 'person' : 'people'} ` +
                  (isRequest ? 'offered to help' : 'got in touch')}
            </h3>
            {this.threads.map((t) =>
              this.renderPerson(t, isRequest && open, t.helperId === r.claimedBy))}
            {this.threads.length === 0 ? (
              <p class="req-d">
                {isRequest
                  ? "When a neighbour offers to help, they'll show up here."
                  : "When a neighbour asks about your work, they'll show up here."}
              </p>
            ) : null}
          </div>
        ) : myThread ? (
          <div class="replies">
            <h3 class="req-h">
              {isRequest && r.claimedBy === this.viewerId
                ? 'They chose you'
                : isRequest && !open
                  ? 'They went with someone else'
                  : 'Your conversation'}
            </h3>
            {this.renderPerson(myThread, false, r.claimedBy === this.viewerId)}
          </div>
        ) : isRequest && !open ? (
          <p class="req-d">Someone else is helping with this one.</p>
        ) : (
          <div class="offer">
            <label class="req-h" htmlFor="offer">
              {isRequest ? 'Offer to help' : 'Ask about this'}
            </label>
            <textarea
              id="offer"
              class="offer-in"
              rows={3}
              maxlength={300}
              placeholder={isRequest
                ? "Say hello, and why you're a good person to ask."
                : 'Say what you need doing, and roughly when.'}
              value={this.drafts[this.viewerId] ?? ''}
              onInput={(e) => this.setDraft(this.viewerId, (e.target as HTMLTextAreaElement).value)}
            ></textarea>
            <button
              class="offer-btn"
              type="button"
              disabled={!(this.drafts[this.viewerId] ?? '').trim() || this.working}
              onClick={this.offerHelp}
            >
              {isRequest ? 'Send offer' : 'Send message'}
            </button>
          </div>
        )}
      </section>
    );
  }

  render() {
    const p = this.current;
    const when = this.whenLine();
    const price = this.priceLine();
    const avail = this.availability();
    const state = lifecycle(p);
    const needsLicence =
      p.kind === 'offer' && requiresLicence((p as OfferPost).trades ?? []);

    return (
      <Host class={{ page: this.fullPage }}>
        <div class="scrim" onClick={this.fullPage ? undefined : this.close}>
          <div
            class="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={p.title}
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            {this.fullPage ? (
              <button class="back" type="button" onClick={this.close}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Back
              </button>
            ) : (
              <div class="grab" aria-hidden="true"></div>
            )}

            {/* No dismiss control here. Close in the footer does that job, and
                two dedicated buttons for one action in a sheet this small is
                redundant — the scrim and Escape are still there too. */}
            <header class="head">
              <div class="badges">
                {p.kind === 'event'
                  ? <le-badge
                      tone={p.author.kind === 'business' ? 'biz' : 'com'}
                      label={p.author.kind === 'business' ? 'Venue' : 'Community'}
                    />
                  : null}
                {p.kind === 'request' ? <le-badge tone="warn" label="Help needed" /> : null}
                {p.kind === 'offer' ? <le-badge tone="good" label="Service" /> : null}
                {state === 'ended' ? <le-badge tone="neutral" label="Finished" /> : null}
              </div>
            </header>

            <div class="body">
              <h2 class="title">{p.title}</h2>

              {/* The reason this view exists. A card cannot show a photo
                  without turning the feed into a slideshow. */}
              {/* Always an image. imageFor falls back to the drawn cover, so a
                  post without a photo opens on something rather than on a gap
                  where the picture should be. */}
              <figure class="shot">
                <img src={imageFor(p)} alt="" />
              </figure>

              <p class="desc">{p.description}</p>

              <dl class="facts">
                {when ? [
                  <dt>When</dt>,
                  <dd>{when}</dd>,
                ] : null}
                <dt>Where</dt>
                <dd>
                  {p.neighbourhood}
                  <span class="dist"> · {formatDistance(this.distanceKm)} away</span>
                </dd>
                {price ? [
                  <dt>Cost</dt>,
                  <dd>{price}</dd>,
                ] : null}
                {avail ? [
                  <dt>Available</dt>,
                  <dd>{avail}</dd>,
                ] : null}
              </dl>

              <div class="author">
                <span class="avatar" aria-hidden="true">
                  {p.author.displayName.charAt(0)}
                </span>
                <span class="who">
                  <span class="name">{p.author.displayName}</span>
                  <span class="sub">
                    <le-badges
                      idVerified={p.author.idVerified}
                      phoneVerified={p.author.phoneVerified === true}
                      size="md"
                    />
                    {/* Spell out what is and is not checked. A badge alone
                        tells you what was verified; only words tell you what
                        was not, and that is the half that matters when you are
                        deciding whether to hand over a key. */}
                    <span class="vwords">{authorProof(p.author)}</span>
                  </span>
                </span>
              </div>

              {p.kind === 'request' || p.kind === 'offer' ? this.renderConversation() : null}

              {/* Two separate warnings, because they are different risks.
                  Licensed trades are gated rather than warned about; everything
                  else carries the neighbours-helping-neighbours disclaimer. */}
              {needsLicence ? (
                <p class="warn licence">
                  Electrical, plumbing, heating and gas work needs a licensed
                  trade. Ask to see the licence before any work starts.
                </p>
              ) : null}

              <p class="warn">
                Local Events just carries the post. Arrangements are between you
                and the other person, at your own risk — meet somewhere public
                and use your judgement.
              </p>
            </div>

            <footer class="foot">
              <button
                class={{ save: true, on: this.saved }}
                type="button"
                aria-pressed={String(this.saved)}
                onClick={this.onSave}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" class="bm">
                  <path
                    d="M6.5 3.5h11a1 1 0 0 1 1 1v15.2a.6.6 0 0 1-.94.5L12 16.4l-5.56 3.8a.6.6 0 0 1-.94-.5V4.5a1 1 0 0 1 1-1Z"
                    fill={this.saved ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linejoin="round"
                  />
                </svg>
                {this.saved ? 'Saved' : 'Save'}
              </button>
              <button class="done" type="button" onClick={this.close}>Close</button>
            </footer>
          </div>
        </div>
      </Host>
    );
  }
}
