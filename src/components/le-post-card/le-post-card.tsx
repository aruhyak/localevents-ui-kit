import { Component, Prop, State, Event, EventEmitter, h, Host } from '@stencil/core';
import type { Post, EventPost, RequestPost, OfferPost } from '@le/shared';
import {
  formatDistance, formatWhen, formatRange, formatDailyRun, formatWeekly, untilOf,
  requiresLicence, isSaved, toggleSave, imageFor,
} from '@le/shared';

/**
 * One post in the feed. Renders all three shapes from a single component,
 * because the feed is one stream — splitting into tabs makes a thin feed
 * look dead.
 *
 * Image-led: the picture is the card, and the text is its caption. The
 * description is deliberately absent — it belongs in the detail view. Two
 * lines of prose per card is what turned thirty events into fifteen screens
 * of scrolling, and it is not what anyone reads when deciding whether to tap.
 *
 * Every post has an image, always: a real photo when someone uploaded one, a
 * drawn cover otherwise. See imageFor() — an image-led card with a hole in it
 * is worse than the text card it replaced.
 */
@Component({
  tag: 'le-post-card',
  styleUrl: 'le-post-card.css',
  shadow: true,
})
export class LePostCard {
  @Prop() post!: Post;
  @Prop() distanceKm = 0;

  /**
   * Row layout instead of a full card.
   *
   * A mode rather than a separate component, so saving and opening behave
   * identically in both densities. Two components would drift, and the bug
   * would be "save works in the list but not the grid".
   */
  @Prop() compact = false;

  @State() saved = false;

  /**
   * Carries the whole post, not just an id.
   *
   * The shell has no post lookup and shouldn't need one — posts live in the
   * fragment that queried for them, and a post written on this device isn't in
   * the seed data at all, so an id would be unresolvable. The card already
   * holds everything the detail view needs.
   */
  @Event({ eventName: 'le:open-post', bubbles: true, composed: true })
  openPost!: EventEmitter<{ post: Post; distanceKm: number }>;

  @Event({ eventName: 'le:toggle-save', bubbles: true, composed: true })
  toggleSaved!: EventEmitter<{ id: string; saved: boolean }>;

  componentWillLoad() {
    this.saved = isSaved(this.post.id);
  }

  private open = () => {
    this.openPost.emit({ post: this.post, distanceKm: this.distanceKm });
  };

  private onSave = (e: MouseEvent) => {
    // The card is itself a button; without this, saving also opens the post.
    e.stopPropagation();
    // Trust what persisted, not what we asked for — a save can fail on quota.
    this.saved = toggleSave(this.post.id);
    this.toggleSaved.emit({ id: this.post.id, saved: this.saved });
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.open();
    }
  };

  private kindBadge() {
    const p = this.post;
    if (p.kind === 'event') {
      return p.author.kind === 'business'
        ? <le-badge tone="biz" label="Venue" />
        : <le-badge tone="com" label="Community" />;
    }
    if (p.kind === 'request') {
      const t = (p as RequestPost).serviceType;
      return <le-badge tone="com" label={t === 'petcare' ? 'Pet care' : 'Help needed'} />;
    }
    return <le-badge tone="biz" label="Service" />;
  }

  private trustBadges() {
    const p = this.post;
    const out = [];

    if (p.author.kind === 'business' && p.author.verified) {
      out.push(<le-badge tone="good" glyph="✓" label="Verified" />);
    }

    if (p.kind === 'offer') {
      const o = p as OfferPost;
      if (requiresLicence(o.trades)) {
        out.push(
          o.licence?.verified
            ? <le-badge tone="good" glyph="✓" label={`Licence ${o.licence.state}`} />
            : <le-badge tone="warn" glyph="!" label="Licence unverified" />,
        );
      }
    }

    if (p.kind === 'request' && (p as RequestPost).requiresHomeAccess) {
      out.push(<le-badge tone="warn" glyph="⌂" label="Home access" />);
    }

    return out;
  }

  /** The time line differs per kind — that's the whole point of the three shapes. */
  private whenLine(): string {
    const p = this.post;
    if (p.kind === 'event') {
      const e = p as EventPost;
      // A run with a last day is described by its hours and that last day.
      // Describing it by its first occurrence gives "ended · repeats" on a
      // sale that is still going, which is worse than saying nothing.
      const until = untilOf(e.rrule);
      if (until !== null) return formatDailyRun(e.startsAt, e.endsAt, until);
      // A weekly listing is described by the day it recurs on, not by the date
      // of one occurrence.
      const weekly = formatWeekly(e.rrule, e.startsAt);
      if (weekly) return weekly;
      return e.rrule ? `${formatWhen(e.startsAt)} · repeats` : formatWhen(e.startsAt);
    }
    if (p.kind === 'request') {
      const r = p as RequestPost;
      return formatRange(r.neededFrom, r.neededTo);
    }
    return (p as OfferPost).availability;
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
    if (e.price) return `$${e.price}`;
    return e.rsvpCount > 0 ? `${e.rsvpCount} going` : null;
  }

  /** The dense form: thumbnail, two lines, distance. Roughly a third the height. */
  private renderCompact() {
    const p = this.post;
    return (
      <article
        class={{ row: true, [`kind-${p.kind}`]: true }}
        tabindex="0"
        role="button"
        onClick={this.open}
        onKeyDown={this.onKey}
      >
        <img class="row-img" src={imageFor(p)} alt="" loading="lazy" decoding="async" />
        <span class="row-text">
          <span class="row-title">{p.title}</span>
          <span class="row-sub">{p.neighbourhood}</span>
        </span>
        <span class="row-right">
          <span class="row-when">{this.whenLine()}</span>
          <span class="row-dist">{formatDistance(this.distanceKm)}</span>
        </span>
      </article>
    );
  }

  render() {
    if (this.compact) return <Host class="is-compact">{this.renderCompact()}</Host>;
    const p = this.post;
    const claimed = p.kind === 'request' && (p as RequestPost).claimState === 'claimed';
    const price = this.priceLine();

    return (
      <Host>
        <article
          class={{ card: true, [`kind-${p.kind}`]: true, claimed }}
          tabindex="0"
          role="button"
          onClick={this.open}
          onKeyDown={this.onKey}
        >
          <div class="cover">
            <img src={imageFor(p)} alt="" loading="lazy" decoding="async" />

            {/* Over the image, not under it — the badges are what the picture
                is for, and putting them below costs a whole line of height. */}
            {/* Trust badges stay on the card. Verified business, an
                unverified licence, and home access are the things someone
                weighs BEFORE tapping — moving them into the detail would mean
                they only see the warning after they are already interested. */}
            <div class="badges">
              {this.kindBadge()}
              {this.trustBadges()}
              {claimed ? <le-badge tone="neutral" label="Claimed" /> : null}
            </div>

            <button
              class={{ save: true, on: this.saved }}
              type="button"
              aria-pressed={String(this.saved)}
              aria-label={this.saved ? 'Saved — tap to remove' : 'Save this post'}
              onClick={this.onSave}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6.5 3.5h11a1 1 0 0 1 1 1v15.2a.6.6 0 0 1-.94.5L12 16.4l-5.56 3.8a.6.6 0 0 1-.94-.5V4.5a1 1 0 0 1 1-1Z"
                  fill={this.saved ? 'currentColor' : 'rgba(9,50,74,0.28)'}
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>

          <div class="text">
            <h3 class="title">{p.title}</h3>
            <p class="meta">
              <span class="when">{this.whenLine()}</span>
              <span class="dot" aria-hidden="true">·</span>
              <span class="dist">{formatDistance(this.distanceKm)}</span>
            </p>
            <p class="foot">
              {price ? <span class="price">{price}</span> : null}
              <span class="who">
                {p.author.displayName}
                {/* A badge, not a bare tick. The word carries the claim — a lone
                    checkmark reads as decoration, and this is the one signal
                    someone weighs before letting a stranger into their home.
                    The scalloped seal is the shape people already read as
                    "verified" on every other platform. */}
                {p.author.idVerified ? (
                  <span class="idv" title="Identity verified">
                    ID
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 2.2 14.6 4l3.2-.2 1 3 2.6 1.9-1.2 3 1.2 3-2.6 1.9-1 3-3.2-.2L12 21.8 9.4 20l-3.2.2-1-3L2.6 15.3l1.2-3-1.2-3 2.6-1.9 1-3L9.4 4Z" fill="currentColor"/>
                      <path d="m8.2 12.2 2.7 2.7 5-5.4" fill="none" stroke="var(--le-verified)"
                            stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                ) : null}
              </span>
            </p>
          </div>
        </article>
      </Host>
    );
  }
}
