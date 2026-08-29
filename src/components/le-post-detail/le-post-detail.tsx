import { Component, Prop, State, Event, EventEmitter, h, Host, Listen } from '@stencil/core';
import type { Post, EventPost, RequestPost, OfferPost, Thread } from '@le/shared';
import {
  formatDistance, formatWhen, formatRange, formatDailyRun, formatWeekly, untilOf,
  requiresLicence, isSaved, toggleSave, lifecycle,
  threadsOn, threadFor, addReply, sendMessage, canSeeContact, contactHint, updateLocalPost,
} from '@le/shared';

/**
 * The full post, opened by tapping a card.
 *
 * The card is a summary — three lines of description, no photo — because a
 * feed of full posts is unscannable. Everything that does not fit there lives
 * here: the whole description, the photo at full width, the exact place, and
 * the actions.
 *
 * A sheet rather than a route. The feed's scroll position, radius, and map
 * state are expensive to rebuild, and a route change throws all of it away for
 * what is really a closer look at something already on screen.
 */
@Component({
  tag: 'le-post-detail',
  styleUrl: 'le-post-detail.css',
  shadow: true,
})
export class LePostDetail {
  @Prop() post!: Post;
  @Prop() distanceKm = 0;
  /** Who is looking. Decides whether the poster's number is shown. */
  @Prop() viewerId = '';
  @Prop() viewerName = '';

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
    });
    this.setDraft(this.viewerId, '');
    this.load();
    this.working = false;
  };

  /** Writing back, in an existing conversation. */
  private send = (helperId: string) => {
    const message = (this.drafts[helperId] ?? '').trim();
    if (!message || this.working) return;
    this.working = true;
    sendMessage({
      postId: this.post.id,
      helperId,
      authorId: this.viewerId,
      displayName: this.viewerName || 'Someone nearby',
      message,
    });
    this.setDraft(helperId, '');
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

  /** Escape closes, like every other dismissible layer in the app. */
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
  /** One conversation: its messages, and a box to answer in. */
  private renderThread(t: Thread, canChoose: boolean, chosen: boolean) {
    const draft = this.drafts[t.helperId] ?? '';
    return (
      <div class={{ thread: true, chosen }} key={t.helperId}>
        <div class="thread-top">
          <span class="thread-who">{t.helperName}</span>
          {chosen ? <span class="tag">Chosen</span> : null}
        </div>

        <div class="bubbles">
          {t.messages.map((m) => (
            <p class={{ bub: true, me: m.authorId === this.viewerId }} key={m.id}>
              {m.message}
            </p>
          ))}
        </div>

        <div class="write">
          <textarea
            class="write-in"
            rows={2}
            maxlength={300}
            placeholder="Write back…"
            value={draft}
            onInput={(e) => this.setDraft(t.helperId, (e.target as HTMLTextAreaElement).value)}
          ></textarea>
          <button
            class="write-btn"
            type="button"
            disabled={!draft.trim() || this.working}
            onClick={() => this.send(t.helperId)}
          >
            Send
          </button>
        </div>

        {canChoose ? (
          <button class="pick" type="button" onClick={() => this.choose(t)}>
            Choose {t.helperName.split(' ')[0]}
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
                  (isRequest ? 'offered' : 'got in touch')}
            </h3>
            {this.threads.map((t) =>
              this.renderThread(t, isRequest && open, t.helperId === r.claimedBy))}
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
            {this.renderThread(myThread, false, r.claimedBy === this.viewerId)}
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
      <Host>
        <div class="scrim" onClick={this.close}>
          <div
            class="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={p.title}
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <div class="grab" aria-hidden="true"></div>

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
              {p.imageUrl ? (
                <figure class="shot">
                  <img src={p.imageUrl} alt="" loading="lazy" />
                </figure>
              ) : null}

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
                    {p.author.idVerified ? 'Identity verified' : 'Not ID verified'}
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
