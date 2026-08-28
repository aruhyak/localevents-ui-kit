import { Component, Prop, State, Event, EventEmitter, h, Host, Listen } from '@stencil/core';
import type { Post, EventPost, RequestPost, OfferPost } from '@le/shared';
import {
  formatDistance, formatWhen, formatRange, requiresLicence,
  isSaved, toggleSave, lifecycle,
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

  @State() saved = false;

  @Event({ eventName: 'le:close-post', bubbles: true, composed: true })
  closePost!: EventEmitter<void>;

  @Event({ eventName: 'le:toggle-save', bubbles: true, composed: true })
  toggleSaved!: EventEmitter<{ id: string; saved: boolean }>;

  componentWillLoad() {
    this.saved = isSaved(this.post.id);
  }

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

  render() {
    const p = this.post;
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
              <button class="x" type="button" aria-label="Close" onClick={this.close}>✕</button>
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
