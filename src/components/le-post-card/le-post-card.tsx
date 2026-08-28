import { Component, Prop, State, Event, EventEmitter, h, Host } from '@stencil/core';
import type { Post, EventPost, RequestPost, OfferPost } from '@le/shared';
import { formatDistance, formatWhen, formatRange, requiresLicence, isSaved, toggleSave } from '@le/shared';

/**
 * One post in the feed. Renders all three shapes from a single component,
 * because the feed is one stream — splitting into tabs makes a thin feed
 * look dead.
 */
@Component({
  tag: 'le-post-card',
  styleUrl: 'le-post-card.css',
  shadow: true,
})
export class LePostCard {
  @Prop() post!: Post;
  @Prop() distanceKm = 0;

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

  render() {
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
          <div class="badges">
            {this.kindBadge()}
            {this.trustBadges()}
            {claimed ? <le-badge tone="neutral" label="Claimed" /> : null}
          </div>

          <h3 class="title">{p.title}</h3>
          <p class="desc">{p.description}</p>

          <div class="meta">
            <span class="when">{this.whenLine()}</span>
            <span class="dot" aria-hidden="true">·</span>
            <span class="dist">{formatDistance(this.distanceKm)}</span>
            {price ? [
              <span class="dot" aria-hidden="true">·</span>,
              <span class="price">{price}</span>,
            ] : null}
          </div>

          <div class="author">
            <span class="avatar" aria-hidden="true">
              {p.author.displayName.charAt(0)}
            </span>
            <span class="name">{p.author.displayName}</span>
            {p.author.idVerified
              ? <span class="idv" title="Identity verified">ID&nbsp;✓</span>
              : null}
            <span class="hood">{p.neighbourhood}</span>

            <button
              class={{ save: true, on: this.saved }}
              type="button"
              aria-pressed={String(this.saved)}
              aria-label={this.saved ? 'Saved — tap to remove' : 'Save this post'}
              title={this.saved ? 'Saved' : 'Save'}
              onClick={this.onSave}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6.5 3.5h11a1 1 0 0 1 1 1v15.2a.6.6 0 0 1-.94.5L12 16.4l-5.56 3.8a.6.6 0 0 1-.94-.5V4.5a1 1 0 0 1 1-1Z"
                  fill={this.saved ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
        </article>
      </Host>
    );
  }
}
