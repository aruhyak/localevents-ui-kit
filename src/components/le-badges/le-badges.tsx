import { Component, Prop, h, Host } from '@stencil/core';

/**
 * The watermarks beside a name.
 *
 * TWO separate claims, deliberately not merged into one "verified" badge:
 *
 *   ID     a government document was checked. Says this is a real person and
 *          that name is theirs.
 *   PHONE  a code was sent to a number and typed back. Says this number rings
 *          on their phone, and gives you a way to reach them that costs money
 *          and a SIM to fake.
 *
 * Someone can have either, both, or neither, and they answer different
 * questions — collapsing them into one tick would tell a neighbour deciding
 * whether to hand over a house key less than they need.
 *
 * ONE COMPONENT RATHER THAN COPIED MARKUP
 * The ID badge was pasted into three places, each with its own copy of the
 * styles inside its own shadow root. Every time markup moved between fragments
 * the styles stayed behind and a badge rendered as bare text. A component
 * carries its own stylesheet wherever it goes, so that stops happening.
 *
 * Sizes in em, so a badge scales with whatever text it sits beside.
 */
@Component({
  tag: 'le-badges',
  styleUrl: 'le-badges.css',
  shadow: true,
})
export class LeBadges {
  /** Government ID checked. */
  @Prop() idVerified = false;

  /** A code was sent to their number and typed back. */
  @Prop() phoneVerified = false;

  /** `sm` beside a name in a list, `md` on a profile or detail header. */
  @Prop() size: 'sm' | 'md' = 'sm';

  /**
   * The seal-and-tick both badges share, so they read as one family.
   *
   * The check is drawn in the PILL's colour, not white: the seal is already
   * white, and a white check on it is invisible. That is not hypothetical —
   * the badge this replaced carried stroke="#fff" on a white seal and rendered
   * as a plain dot everywhere it appeared, for as long as it existed. Nothing
   * fails when a tick is the same colour as what is behind it.
   */
  private tick() {
    return (
      <svg class="tick" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 2.2 14.6 4l3.2-.2 1 3 2.6 1.9-1.2 3 1.2 3-2.6 1.9-1 3-3.2-.2L12 21.8 9.4 20l-3.2.2-1-3L2.6 15.3l1.2-3-1.2-3 2.6-1.9 1-3L9.4 4Z"
          fill="#fff"
        />
        {/* Colour comes from CSS, not a stroke="" attribute: var() inside an
            SVG presentation attribute is not reliably resolved, and when it
            fails the stroke falls back to black rather than to nothing —
            which looks deliberate and so never gets reported. */}
        <path
          class="check"
          d="m8.2 12.2 2.7 2.7 5-5.4"
          fill="none"
          stroke-width="2.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    );
  }

  render() {
    if (!this.idVerified && !this.phoneVerified) return <Host class="empty" />;
    return (
      <Host class={this.size}>
        {this.idVerified ? (
          <span class="badge id" title="Government ID checked">
            <span class="label">ID</span>
            {this.tick()}
          </span>
        ) : null}

        {this.phoneVerified ? (
          <span class="badge phone" title="Phone number confirmed by text">
            <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
              <rect
                x="6" y="2.6" width="12" height="18.8" rx="2.6"
                fill="none" stroke="currentColor" stroke-width="2.1"
              />
              <path
                d="M10.6 18.2h2.8" stroke="currentColor"
                stroke-width="2.1" stroke-linecap="round"
              />
            </svg>
            {this.tick()}
          </span>
        ) : null}
      </Host>
    );
  }
}
