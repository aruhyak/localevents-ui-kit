import { Component, Prop, State, Event, EventEmitter, h, Host, Listen } from '@stencil/core';
import type { ServiceType } from '@le/shared';

/**
 * Asking a neighbour for a hand.
 *
 * One component for both Pets and Handyman, because the ask is the same shape
 * either way — what, when, roughly what it's worth, and whether someone has to
 * come into your home. Two near-identical sheets would drift apart within a
 * week, and the in-home rule is exactly the thing that must not drift.
 *
 * ── WHY THERE IS NO ID STEP HERE ──────────────────────────────────────────
 * Verification belongs to the profile, and asking again mid-post is asking
 * twice for the same thing. The house-access flag is still recorded — it is
 * what the card badges and what a helper weighs before offering — but the
 * trust signal is the ID badge on the person, shown wherever their name is.
 */
@Component({
  tag: 'le-ask',
  styleUrl: 'le-ask.css',
  shadow: true,
})
export class LeAsk {
  /** What kind of ask this sheet creates. */
  @Prop() serviceType: ServiceType = 'petcare';
  @Prop() neighbourhood = '';

  /**
   * Render the form as a page instead of a sheet.
   *
   * A compose form is a task, not a peek: it is long, it holds unsaved work,
   * and it wants the whole screen. As a sheet it also sat over a list it had
   * no relationship to. In page mode this component renders ONLY the form; in
   * list mode it renders only the button that navigates here.
   */
  @Prop() page = false;

  /** Where the button goes. The fragment knows its own route; this does not. */
  @Prop() href = '';

  @State() open = false;
  @State() error = '';
  @State() posted = false;
  @State() draft = {
    title: '',
    description: '',
    from: '',
    to: '',
    budget: '',
    homeAccess: false,
    phone: '',
  };

  @Event({ eventName: 'le:create-request', bubbles: true, composed: true })
  createRequest!: EventEmitter<Record<string, unknown>>;

  @Listen('keydown', { target: 'document' })
  onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.open) this.close();
  }

  private static dayFromNow(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private start = () => {
    this.draft = {
      title: '',
      description: '',
      from: LeAsk.dayFromNow(1),
      to: LeAsk.dayFromNow(2),
      // Pet care nearly always means someone comes in; a lawn nearly always
      // does not. Defaulting to the common case is not the same as deciding
      // it — the toggle is right there.
      homeAccess: this.serviceType === 'petcare',
      budget: '',
      phone: '',
    };
    this.error = '';
    this.open = true;
  };

  private close = () => { this.open = false; this.error = ''; };

  private set<K extends keyof typeof this.draft>(k: K, v: (typeof this.draft)[K]) {
    this.draft = { ...this.draft, [k]: v };
  }

  private submit = () => {
    const d = this.draft;
    if (!d.title.trim()) { this.error = 'Give it a title'; return; }
    if (!d.from || !d.to) { this.error = 'Say when you need it'; return; }
    if (d.to < d.from) { this.error = 'The last day cannot be before the first'; return; }

    this.createRequest.emit({
      serviceType: this.serviceType,
      title: d.title.trim(),
      description: d.description.trim(),
      neededFrom: new Date(`${d.from}T09:00`).toISOString(),
      neededTo: new Date(`${d.to}T18:00`).toISOString(),
      budget: d.budget ? Number(d.budget) : undefined,
      requiresHomeAccess: d.homeAccess,
      contactPhone: d.phone.trim() || undefined,
    });
    this.open = false;
    this.posted = true;
    setTimeout(() => (this.posted = false), 3200);
  };

  componentWillLoad() {
    // The page IS the form, so there is nothing to open — it starts filled in.
    if (this.page) this.start();
  }

  render() {
    const d = this.draft;
    const isPets = this.serviceType === 'petcare';

    if (this.page) {
      return (
        <Host class="as-page">
          {this.renderForm(d, isPets)}
        </Host>
      );
    }

    return (
      <Host>
        {this.posted ? <p class="toast">Posted — neighbours nearby can see it now.</p> : null}

        <a
          class="fab"
          href={this.href || '#/feed'}
          aria-label={isPets ? 'Ask for help with a pet' : 'Post a job'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 20.4l.9-3.6a2 2 0 0 1 .53-.95l9.9-9.9a2 2 0 0 1 2.83 0l1.87 1.87a2 2 0 0 1 0 2.83l-9.9 9.9a2 2 0 0 1-.95.53Z"/>
            <path d="M13.6 6.6l3.8 3.8"/>
          </svg>
        </a>
      </Host>
    );
  }

  private renderForm(d: typeof this.draft, isPets: boolean) {
    return (
          <div>
            <div>
              <h2 class="title">{isPets ? 'Ask a neighbour' : 'Post a job'}</h2>

              <label class="f">
                <span class="k">What do you need?</span>
                <input class="in" type="text" maxlength={80}
                  placeholder={isPets ? 'Feed my cat while we’re away' : 'Lawn needs cutting'}
                  value={d.title}
                  onInput={(e) => this.set('title', (e.target as HTMLInputElement).value)} />
              </label>

              <label class="f">
                <span class="k">Details <em>optional</em></span>
                <textarea class="in area" rows={3} maxlength={400}
                  placeholder={isPets
                    ? 'One indoor cat, very easy. Dry food twice a day.'
                    : 'Small front and back, hasn’t been done in a month.'}
                  value={d.description}
                  onInput={(e) => this.set('description', (e.target as HTMLTextAreaElement).value)}></textarea>
              </label>

              <div class="f">
                <span class="k">When</span>
                <div class="range">
                  <label class="r">
                    <span class="rk">From</span>
                    <input type="date" value={d.from}
                      onInput={(e) => this.set('from', (e.target as HTMLInputElement).value)} />
                  </label>
                  <span class="arrow" aria-hidden="true">→</span>
                  <label class="r">
                    <span class="rk">To</span>
                    <input type="date" min={d.from} value={d.to}
                      onInput={(e) => this.set('to', (e.target as HTMLInputElement).value)} />
                  </label>
                </div>
              </div>

              <label class="f">
                <span class="k">Budget <em>optional</em></span>
                <input class="in" type="number" min="0" inputMode="numeric"
                  placeholder="20" value={d.budget}
                  onInput={(e) => this.set('budget', (e.target as HTMLInputElement).value)} />
              </label>

              <label class="f">
                <span class="k">Your number <em>optional</em></span>
                <input class="in" type="tel" placeholder="Only shown to the person you choose"
                  value={d.phone}
                  onInput={(e) => this.set('phone', (e.target as HTMLInputElement).value)} />
                <p class="note">
                  Nobody sees this until you pick someone. During the trial it is
                  stored on this device only — use a number you don&apos;t mind sharing.
                </p>
              </label>

              <button
                class={{ toggle: true, on: d.homeAccess }}
                type="button"
                aria-pressed={String(d.homeAccess)}
                onClick={() => this.set('homeAccess', !d.homeAccess)}
              >
                <span class="box" aria-hidden="true">{d.homeAccess ? '✓' : ''}</span>
                Someone needs to come into my home
              </button>


              {this.error ? <p class="err">{this.error}</p> : null}

              <div class="foot">
                {this.page ? (
                  <a class="ghost" href={this.href || '#/feed'}>Cancel</a>
                ) : (
                  <button class="ghost" type="button" onClick={this.close}>Cancel</button>
                )}
                <button class="primary" type="button" onClick={this.submit}>
                  Post it
                </button>
              </div>
            </div>
          </div>
    );
  }
}
