import { Component, Prop, h, Host } from '@stencil/core';

export type BadgeTone = 'com' | 'biz' | 'warn' | 'good' | 'neutral';

/**
 * Small status pill. Used for post kind, verified business, licence state.
 *
 * Licence badges are deliberately honest: an unverified trade shows
 * "unverified" rather than nothing, because SB 378 requires platforms to
 * disclose whether they verify — silence is not an option.
 */
@Component({
  tag: 'le-badge',
  styleUrl: 'le-badge.css',
  shadow: true,
})
export class LeBadge {
  @Prop() tone: BadgeTone = 'neutral';
  @Prop() label!: string;
  /** Optional leading glyph, e.g. a check for verified. */
  @Prop() glyph?: string;

  render() {
    return (
      <Host>
        <span class={`badge tone-${this.tone}`}>
          {this.glyph ? <span class="glyph" aria-hidden="true">{this.glyph}</span> : null}
          {this.label}
        </span>
      </Host>
    );
  }
}
