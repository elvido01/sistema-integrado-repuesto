export const styles = `
  :host {
    all: initial;
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  button,
  input {
    font: inherit;
  }

  .mf-panel {
    position: fixed;
    top: 12px;
    right: 12px;
    bottom: 12px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    width: min(390px, calc(100vw - 24px));
    overflow: hidden;
    border: 1px solid #d6e3dc;
    border-radius: 8px;
    background: #f7faf8;
    box-shadow: 0 18px 50px rgba(17, 24, 39, 0.22);
    color: #13211a;
  }

  .mf-header {
    position: relative;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px;
    background: #ffffff;
    border-bottom: 1px solid #dbe7e1;
  }

  .mf-header > .mf-icon-button,
  .mf-summary-strip,
  .mf-session {
    display: none;
  }

  .mf-header-actions {
    position: absolute;
    top: 10px;
    right: 12px;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .mf-header-actions span {
    color: #0f766a;
    font-size: 11px;
    font-weight: 800;
  }

  .mf-logout-button {
    height: 28px;
    padding: 0 9px;
    border: 1px solid #b8d8cc;
    border-radius: 6px;
    background: #ffffff;
    color: #24584d;
    cursor: pointer;
    font-size: 12px;
    font-weight: 800;
  }

  .mf-kicker {
    margin: 0 0 3px;
    color: #128c7e;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .mf-beta-badge {
    display: inline-flex;
    align-items: center;
    height: 16px;
    margin-left: 5px;
    padding: 0 5px;
    border-radius: 4px;
    background: #111827;
    color: #ffffff;
    font-size: 9px;
    line-height: 1;
    vertical-align: 1px;
  }

  .mf-header h2 {
    margin: 0;
    font-size: 17px;
    line-height: 1.2;
  }

  .mf-chat {
    max-width: 280px;
    margin: 5px 0 0;
    overflow: hidden;
    color: #5f6d66;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mf-icon-button,
  .mf-line-controls button {
    width: 30px;
    height: 30px;
    border: 1px solid #d4ded9;
    border-radius: 6px;
    background: #ffffff;
    color: #4d5c54;
    cursor: pointer;
  }

  .mf-omni-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 14px;
    background: #f3f8f6;
    border-bottom: 1px solid #dbe7e1;
  }

  .mf-omni-left-dock {
    position: fixed;
    top: 280px;
    left: 10px;
    z-index: 2147483647;
    width: 44px;
    padding: 5px;
    border: 1px solid #d6e3dc;
    border-radius: 8px;
    background: rgba(247, 250, 248, 0.96);
    box-shadow: 0 14px 34px rgba(17, 24, 39, 0.18);
    color: #13211a;
  }

  .mf-omni-rail {
    display: grid;
    gap: 6px;
  }

  .mf-omni-rail button {
    position: relative;
    width: 32px;
    height: 32px;
    min-width: 0;
    border: 1px solid #cfdcd6;
    border-radius: 6px;
    background: #ffffff;
    color: #315048;
    cursor: pointer;
    font-size: 10px;
    font-weight: 900;
  }

  .mf-omni-rail button.is-active {
    border-color: #128c7e;
    background: #dff6ef;
    color: #0f766a;
  }

  .mf-omni-rail button.is-disabled {
    cursor: not-allowed;
    opacity: 0.46;
  }

  .mf-omni-rail button b {
    position: absolute;
    top: -6px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: #ef4444;
    color: #ffffff;
    font-size: 9px;
    line-height: 16px;
  }

  .mf-safe-button {
    height: 30px;
    padding: 0 10px;
    border: 1px solid #f0b27a;
    border-radius: 6px;
    background: #ffffff;
    color: #9a4a12;
    cursor: pointer;
    font-size: 10px;
    font-weight: 900;
  }

  .mf-omni-version {
    color: #6b7280;
    font-size: 10px;
    font-weight: 700;
  }

  .mf-omni-workspace {
    position: fixed;
    top: 0;
    right: 410px;
    bottom: 0;
    left: 64px;
    z-index: 2147483646;
    overflow: hidden;
    border-right: 1px solid #d6e3dc;
    background: #f7faf8;
    color: #13211a;
    box-shadow: 12px 0 32px rgba(17, 24, 39, 0.08);
  }

  .mf-summary-strip {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    background: #e8f5ee;
    border-bottom: 1px solid #d6e8df;
    font-size: 13px;
  }

  .mf-omni-inbox {
    display: grid;
    grid-template-rows: auto auto auto auto minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-height: 0;
    background: #f7faf8;
  }

  .mf-omni-inbox-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    background: #ffffff;
    border-bottom: 1px solid #dbe7e1;
  }

  .mf-omni-inbox-head strong {
    display: block;
    color: #13211a;
    font-size: 13px;
    line-height: 1.2;
  }

  .mf-omni-inbox-head span {
    display: block;
    margin-top: 2px;
    color: #64746c;
    font-size: 11px;
    font-weight: 700;
  }

  .mf-omni-inbox-head button,
  .mf-omni-reply button {
    height: 30px;
    padding: 0 10px;
    border: 1px solid #b8d8cc;
    border-radius: 6px;
    background: #ffffff;
    color: #126f64;
    cursor: pointer;
    font-size: 11px;
    font-weight: 900;
  }

  .mf-omni-inbox-head button:disabled,
  .mf-omni-reply button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .mf-omni-search {
    padding: 10px 14px;
    background: #ffffff;
    border-bottom: 1px solid #dbe7e1;
  }

  .mf-omni-filters {
    display: flex;
    gap: 7px;
    overflow-x: auto;
    padding: 8px 12px;
    border-bottom: 1px solid #dbe7e1;
    background: #ffffff;
  }

  .mf-omni-filters button {
    height: 28px;
    white-space: nowrap;
    border: 1px solid #cfdcd6;
    border-radius: 999px;
    background: #ffffff;
    color: #315048;
    cursor: pointer;
    font-size: 11px;
    font-weight: 800;
    padding: 0 10px;
  }

  .mf-omni-filters button.is-active {
    border-color: #128c7e;
    background: #dff6ef;
    color: #0f766a;
  }

  .mf-omni-search input {
    width: 100%;
    height: 34px;
    min-width: 0;
    padding: 0 10px;
    border: 1px solid #cfdcd6;
    border-radius: 6px;
    background: #ffffff;
    color: #13211a;
    outline: none;
    font-size: 12px;
  }

  .mf-omni-search input:focus {
    border-color: #128c7e;
    box-shadow: 0 0 0 2px rgba(18, 140, 126, 0.15);
  }

  .mf-omni-error {
    margin: 0;
    padding: 8px 14px;
    background: #fff1f2;
    color: #be123c;
    font-size: 12px;
    font-weight: 800;
  }

  .mf-omni-layout {
    display: grid;
    grid-template-columns: minmax(320px, 36%) minmax(380px, 1fr);
    min-height: 0;
    overflow: hidden;
  }

  .mf-omni-list {
    min-height: 0;
    overflow: auto;
    border-right: 1px solid #dbe7e1;
    background: #ffffff;
  }

  .mf-omni-list > button {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    gap: 9px;
    width: 100%;
    min-width: 0;
    padding: 9px 12px;
    border: 0;
    border-bottom: 1px solid #edf3f0;
    background: #ffffff;
    color: #13211a;
    cursor: pointer;
    text-align: left;
  }

  .mf-omni-list > button.is-active {
    background: #e8f5ee;
  }

  .mf-omni-avatar {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: #dff6ef;
    color: #0f766a;
    font-size: 13px;
    font-weight: 900;
  }

  .mf-omni-conv-main {
    min-width: 0;
  }

  .mf-omni-conv-main b,
  .mf-omni-conv-main small,
  .mf-omni-conv-side small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mf-omni-conv-main b {
    color: #13211a;
    font-size: 12px;
    line-height: 1.25;
  }

  .mf-omni-conv-main small {
    margin-top: 3px;
    color: #64746c;
    font-size: 11px;
  }

  .mf-omni-conv-side {
    display: grid;
    justify-items: end;
    gap: 4px;
    max-width: 62px;
  }

  .mf-omni-conv-side i,
  .mf-omni-conv-side em,
  .mf-omni-detail-head b {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 20px;
    padding: 0 5px;
    border-radius: 5px;
    background: #111827;
    color: #ffffff;
    font-size: 10px;
    font-style: normal;
    font-weight: 900;
  }

  .mf-omni-conv-side em {
    min-width: 18px;
    height: 18px;
    background: #ef4444;
    font-size: 9px;
    font-style: normal;
  }

  .mf-omni-conv-side small {
    color: #64746c;
    font-size: 10px;
  }

  .mf-omni-detail {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-height: 0;
    background: #efeae2;
  }

  .mf-omni-empty {
    display: grid;
    place-items: center;
    min-height: 220px;
    color: #64746c;
    font-size: 12px;
    font-weight: 800;
  }

  .mf-omni-detail-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 12px;
    background: #ffffff;
    border-bottom: 1px solid #dbe7e1;
  }

  .mf-omni-detail-head strong {
    display: block;
    max-width: 250px;
    overflow: hidden;
    color: #13211a;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mf-omni-detail-head span {
    display: block;
    margin-top: 2px;
    color: #64746c;
    font-size: 11px;
    font-weight: 700;
  }

  .mf-omni-detail-head select {
    max-width: 125px;
    height: 28px;
    min-width: 0;
    padding: 0 7px;
    border: 1px solid #cfdcd6;
    border-radius: 6px;
    background: #ffffff;
    color: #315048;
    font-size: 11px;
    font-weight: 800;
    outline: none;
  }

  .mf-omni-messages {
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: 7px;
    overflow: auto;
    padding: 12px;
  }

  .mf-omni-messages article {
    max-width: 82%;
    padding: 8px 9px;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
  }

  .mf-omni-messages article.is-incoming {
    align-self: flex-start;
    background: #ffffff;
  }

  .mf-omni-messages article.is-outgoing {
    align-self: flex-end;
    background: #d9fdd3;
  }

  .mf-omni-messages article p {
    margin: 0;
    color: #13211a;
    font-size: 12px;
    line-height: 1.35;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .mf-omni-messages article small {
    display: block;
    margin-top: 4px;
    color: #64746c;
    font-size: 10px;
    text-align: right;
  }

  .mf-omni-reply {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 7px;
    padding: 10px 12px;
    background: #ffffff;
    border-top: 1px solid #dbe7e1;
  }

  .mf-omni-reply textarea {
    grid-column: 1 / -1;
    width: 100%;
    min-width: 0;
    min-height: 48px;
    max-height: 92px;
    resize: vertical;
    padding: 8px 9px;
    border: 1px solid #cfdcd6;
    border-radius: 7px;
    background: #ffffff;
    color: #13211a;
    font: inherit;
    font-size: 12px;
    line-height: 1.35;
    outline: none;
  }

  .mf-omni-reply textarea:focus {
    border-color: #128c7e;
    box-shadow: 0 0 0 2px rgba(18, 140, 126, 0.15);
  }

  .mf-omni-reply button[type="submit"] {
    background: #128c7e;
    color: #ffffff;
  }

  .mf-social-commercial {
    display: grid;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid #dbe7e1;
    background: #ffffff;
  }

  .mf-social-commercial-head {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
  }

  .mf-social-avatar {
    display: inline-grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 999px;
    background: #dff6ef;
    color: #0f766a;
    font-size: 16px;
    font-weight: 900;
  }

  .mf-social-commercial-head strong,
  .mf-social-commercial-head small {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mf-social-commercial-head strong {
    color: #13211a;
    font-size: 14px;
  }

  .mf-social-commercial-head small,
  .mf-social-empty-commercial p {
    margin-top: 2px;
    color: #64746c;
    font-size: 11px;
    font-weight: 700;
  }

  .mf-social-link-state {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 9px;
    border: 1px solid #dbe7e1;
    border-radius: 7px;
    background: #f7faf8;
    font-size: 12px;
  }

  .mf-social-link-state span {
    color: #64746c;
    font-weight: 800;
  }

  .mf-social-link-state b {
    color: #0f766a;
  }

  .mf-social-commercial-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
  }

  .mf-social-commercial-actions button {
    min-height: 34px;
    border: 1px solid #b8d8cc;
    border-radius: 7px;
    background: #ffffff;
    color: #126f64;
    cursor: pointer;
    font-size: 11px;
    font-weight: 900;
  }

  .mf-social-commercial-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .mf-social-empty-commercial {
    display: grid;
    gap: 4px;
    padding: 14px 10px;
    text-align: center;
  }

  .mf-social-empty-commercial strong {
    font-size: 13px;
  }

  .mf-search {
    position: relative;
    padding: 12px 14px;
    background: #ffffff;
    border-bottom: 1px solid #dbe7e1;
  }

  .mf-login {
    display: grid;
    gap: 8px;
    padding: 12px 14px;
    background: #fffaf0;
    border-bottom: 1px solid #eadfca;
  }

  .mf-login strong {
    font-size: 13px;
  }

  .mf-login p {
    margin: 0;
    color: #695f4c;
    font-size: 12px;
    line-height: 1.35;
  }

  .mf-login input,
  .mf-login select {
    width: 100%;
    height: 34px;
    min-width: 0;
    padding: 0 9px;
    border: 1px solid #d7c9aa;
    border-radius: 6px;
    background: #ffffff;
    color: #13211a;
    outline: none;
  }

  .mf-login button {
    height: 34px;
    border: 0;
    border-radius: 6px;
    background: #1f6f64;
    color: #ffffff;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-login button:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .mf-session {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 14px;
    background: #edf8f3;
    border-bottom: 1px solid #d4e9df;
    color: #24584d;
    font-size: 12px;
    font-weight: 700;
  }

  .mf-session button {
    height: 26px;
    padding: 0 10px;
    border: 1px solid #b8d8cc;
    border-radius: 6px;
    background: #ffffff;
    color: #24584d;
    cursor: pointer;
  }

  .mf-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 10px 14px;
    background: #ffffff;
    border-bottom: 1px solid #dbe7e1;
  }

  .mf-tabs button {
    height: 40px;
    border: 1px solid #cfdcd6;
    border-radius: 8px;
    background: #ffffff;
    color: #4d5c54;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-tab-quote.is-active {
    border-color: #128c7e;
    background: #128c7e;
    color: #ffffff;
  }

  .mf-tab-cobro.is-active {
    border-color: #ea7d23;
    background: #ffffff;
    color: #c2410c;
  }

  .mf-motoflow-box {
    position: relative;
    background: #ffffff;
    border-bottom: 1px solid #dbe7e1;
  }

  .mf-motoflow-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-height: 46px;
    padding: 8px 14px;
    border: 0;
    background: #ffffff;
    color: #13211a;
    cursor: pointer;
    text-align: left;
  }

  .mf-motoflow-toggle span {
    display: grid;
    min-width: 0;
    font-size: 12px;
    font-weight: 900;
  }

  .mf-motoflow-toggle small {
    display: block;
    max-width: 270px;
    margin-top: 2px;
    overflow: hidden;
    color: #66766e;
    font-size: 11px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mf-motoflow-toggle b {
    color: #126f64;
    font-size: 12px;
  }

  .mf-customer-box {
    position: relative;
    display: grid;
    gap: 8px;
    padding: 10px 14px;
    background: #f8fbf9;
    border-top: 1px solid #edf3f0;
  }

  .mf-customer-box label {
    color: #405047;
    font-size: 12px;
    font-weight: 800;
  }

  .mf-customer-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 7px;
  }

  .mf-customer-row input,
  .mf-customer-grid input,
  .mf-customer-grid select {
    width: 100%;
    height: 34px;
    min-width: 0;
    padding: 0 9px;
    border: 1px solid #cfdcd6;
    border-radius: 6px;
    background: #ffffff;
    color: #13211a;
    outline: none;
  }

  .mf-customer-row button {
    width: 34px;
    height: 34px;
    border: 1px solid #d4ded9;
    border-radius: 6px;
    background: #ffffff;
    color: #4d5c54;
    cursor: pointer;
  }

  .mf-customer-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
  }

  .mf-customer-results {
    position: absolute;
    top: 70px;
    right: 14px;
    left: 14px;
    z-index: 4;
    max-height: 210px;
    overflow: auto;
    border: 1px solid #cfdcd6;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
  }

  .mf-customer-results button {
    display: block;
    width: 100%;
    padding: 9px 10px;
    border: 0;
    border-bottom: 1px solid #edf2ef;
    background: #ffffff;
    color: #13211a;
    text-align: left;
    cursor: pointer;
  }

  .mf-customer-results button:hover {
    background: #f2faf6;
  }

  .mf-customer-results small {
    display: block;
    margin-top: 2px;
    color: #66766e;
    font-size: 11px;
  }

  .mf-workflow-box {
    display: grid;
    gap: 8px;
    padding: 10px 14px 12px;
    background: #f8fbf9;
    border-top: 1px solid #edf3f0;
  }

  .mf-workflow-box label {
    color: #405047;
    font-size: 12px;
    font-weight: 800;
  }

  .mf-status-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .mf-status-grid button {
    min-height: 30px;
    padding: 0 8px;
    border: 1px solid #cfdcd6;
    border-radius: 6px;
    background: #ffffff;
    color: #405047;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-status-grid button.is-active {
    border-color: #128c7e;
    background: #e2f6ee;
    color: #0f766a;
  }

  .mf-workflow-box textarea {
    width: 100%;
    min-height: 54px;
    resize: vertical;
    padding: 8px 9px;
    border: 1px solid #cfdcd6;
    border-radius: 6px;
    background: #ffffff;
    color: #13211a;
    outline: none;
  }

  .mf-cobro-box {
    display: grid;
    gap: 8px;
    padding: 10px 14px 12px;
    background: #fff8f1;
    border-bottom: 1px solid #f0e0cd;
  }

  .mf-cobro-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .mf-cobro-head strong {
    color: #9a4a12;
    font-size: 12px;
    font-weight: 900;
  }

  .mf-cobro-head button {
    height: 30px;
    padding: 0 12px;
    border: 1px solid #e3b483;
    border-radius: 6px;
    background: #ffffff;
    color: #9a4a12;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-cobro-head button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .mf-cobro-ok {
    margin: 0;
    color: #0f766a;
    font-size: 12px;
    font-weight: 700;
  }

  .mf-cobro-msg {
    margin: 0 14px;
    padding: 7px 9px;
    border-radius: 6px;
    background: #fdeede;
    color: #9a4a12;
    font-size: 12px;
    line-height: 1.35;
  }

  /* ===== Lista de cobranza (morosos) ===== */
  .mf-cobranza {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #fff8f1;
  }

  .mf-cobranza-head {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    padding: 10px 14px 8px;
    background: #ffffff;
  }

  .mf-cobranza-filter {
    height: 34px;
    min-width: 0;
    padding: 0 10px;
    border: 1px solid #e3b483;
    border-radius: 6px;
    background: #ffffff;
    color: #13211a;
    outline: none;
  }

  .mf-cobranza-head button {
    width: 38px;
    height: 34px;
    border: 1px solid #e3b483;
    border-radius: 6px;
    background: #ffffff;
    color: #9a4a12;
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
    line-height: 1;
  }

  .mf-cobranza-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 14px;
    background: #fdeede;
    border-bottom: 1px solid #f0e0cd;
    color: #9a4a12;
    font-size: 12px;
    font-weight: 800;
  }

  .mf-cobranza-summary b {
    color: #c2410c;
    font-size: 14px;
  }

  .mf-cobranza-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    display: grid;
    gap: 9px;
    padding: 10px 14px 14px;
  }

  .mf-cob-card {
    min-width: 0;
    display: grid;
    gap: 7px;
    padding: 10px;
    border: 1px solid #f0ddc6;
    border-radius: 8px;
    background: #ffffff;
  }

  .mf-cob-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .mf-cob-card-head strong {
    font-size: 13px;
    color: #13211a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mf-cob-badge {
    flex: none;
    padding: 2px 8px;
    border-radius: 999px;
    background: #fde9c7;
    color: #9a4a12;
    font-size: 11px;
    font-weight: 800;
  }

  .mf-cob-badge.is-red {
    background: #fde0db;
    color: #c2410c;
  }

  .mf-cobranza-tabs {
    flex: 0 0 auto;
    padding: 12px 18px 18px;
    background: #ffffff;
    border-bottom: 2px solid #ea7d23;
    overflow: hidden;
  }

  .mf-cobranza-tabs-scroll {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 16px 26px;
    width: 100%;
    overflow: visible;
  }

  .mf-cobranza-tabs-scroll button {
    min-width: 0;
    min-height: 30px;
    padding: 4px 8px;
    border: 1px solid #e3b483;
    border-radius: 6px;
    background: #ffffff;
    color: #6b5840;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
    white-space: normal;
    line-height: 1.15;
  }

  .mf-cobranza-tabs-scroll button.is-active {
    border-color: #ea7d23;
    background: #fff8ec;
    color: #9a4a12;
  }

  .mf-cobranza-tabs-scroll .mf-tab-reenviar.is-active {
    border-color: #c2410c;
    background: #c2410c;
    color: #ffffff;
  }

  .mf-cob-head-badges {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: none;
  }

  .mf-cob-badge.is-reenviar {
    background: #c2410c;
    color: #ffffff;
  }

  .mf-cob-card-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
    color: #5a4632;
  }

  .mf-cob-card-info b {
    color: #c2410c;
    font-size: 14px;
    font-weight: 800;
    flex: none;
  }

  .mf-cob-phone {
    flex: 1 1 auto;
    min-width: 0;
    height: 28px;
    padding: 0 7px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: #5a4632;
    font-size: 12px;
    outline: none;
  }

  .mf-cob-phone:hover {
    border-color: #f0ddc6;
    background: #fffdf9;
  }

  .mf-cob-phone:focus {
    border-color: #ea7d23;
    background: #ffffff;
  }

  .mf-cob-phone::placeholder {
    color: #b9a98f;
  }

  .mf-cob-card-facts {
    color: #8a7a66;
    font-size: 11px;
    line-height: 1.3;
  }

  .mf-cob-seg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .mf-cob-seg button {
    min-width: 0;
    min-height: 30px;
    padding: 0 8px;
    border: 1px solid #e3cfb4;
    border-radius: 6px;
    background: #ffffff;
    color: #6b5840;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mf-cob-seg button.is-active {
    border-color: #ea7d23;
    background: #fde9c7;
    color: #9a4a12;
  }

  .mf-cob-date,
  .mf-cob-nota {
    width: 100%;
    height: 32px;
    min-width: 0;
    padding: 0 9px;
    border: 1px solid #e3cfb4;
    border-radius: 6px;
    background: #fffdf9;
    color: #13211a;
    outline: none;
    font-size: 12px;
  }

  .mf-cob-send {
    height: 36px;
    border: 0;
    border-radius: 7px;
    background: #ea7d23;
    color: #ffffff;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-cob-send:hover {
    background: #d96f17;
  }

  .mf-cob-send:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .mf-cob-save {
    background: #128c7e;
  }

  .mf-cob-save:hover {
    background: #0f786d;
  }

  .mf-cob-buscar {
    background: #2563eb;
  }

  .mf-cob-buscar:hover {
    background: #1d4ed8;
  }

  .mf-cobro-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
    font-weight: 800;
    color: #9a4a12;
  }

  .mf-cobro-summary b {
    color: #c2410c;
    font-size: 14px;
  }

  .mf-cobro-list {
    display: grid;
    gap: 5px;
    max-height: 132px;
    overflow: auto;
  }

  .mf-cobro-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 10px;
    align-items: center;
    padding: 6px 8px;
    border: 1px solid #f0ddc6;
    border-radius: 6px;
    background: #ffffff;
    font-size: 12px;
    color: #5a4632;
  }

  .mf-cobro-row b {
    color: #c2410c;
    font-weight: 800;
  }

  .mf-quick-send-list {
    display: grid;
    gap: 7px;
    max-height: 380px;
    overflow: auto;
    padding: 12px 10px 16px;
    border-top: 2px solid #f97316;
    background: #fff7ed;
  }

  .mf-quick-send-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 76px;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border: 1px solid #fed7aa;
    border-radius: 7px;
    background: #ffffff;
  }

  .mf-quick-send-main {
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: #1f2937;
    text-align: left;
    cursor: pointer;
  }

  .mf-quick-send-main strong,
  .mf-quick-send-main small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mf-quick-send-main strong {
    font-size: 12px;
    font-weight: 900;
  }

  .mf-quick-send-main small {
    margin-top: 2px;
    color: #6b7280;
    font-size: 10px;
    font-weight: 700;
  }

  .mf-quick-send-amount {
    color: #dc2626;
    font-size: 11px;
    font-weight: 900;
    white-space: nowrap;
  }

  .mf-quick-send-button {
    height: 32px;
    border: 1px solid #fb923c;
    border-radius: 7px;
    background: #fff7ed;
    color: #c2410c;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
  }

  .mf-quick-send-button:hover {
    background: #f97316;
    color: #ffffff;
  }

  .mf-quick-send-button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  .mf-quick-empty {
    margin: 18px 0;
    color: #8a5a33;
    font-size: 12px;
    font-weight: 800;
    text-align: center;
  }

  .mf-cobro-paste {
    width: 100%;
    height: 38px;
    border: 0;
    border-radius: 7px;
    background: #ea7d23;
    color: #ffffff;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-cobro-paste:hover {
    background: #d96f17;
  }

  .mf-cobro-paste:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .mf-search label {
    display: block;
    margin-bottom: 6px;
    color: #405047;
    font-size: 12px;
    font-weight: 700;
  }

  .mf-search input,
  .mf-line-controls input {
    width: 100%;
    min-width: 0;
    border: 1px solid #cfdcd6;
    border-radius: 6px;
    background: #ffffff;
    color: #13211a;
    outline: none;
  }

  .mf-search input {
    height: 38px;
    padding: 0 10px;
  }

  .mf-search input:focus,
  .mf-line-controls input:focus {
    border-color: #128c7e;
    box-shadow: 0 0 0 2px rgba(18, 140, 126, 0.15);
  }

  .mf-muted {
    margin: 8px 0 0;
    color: #64746c;
    font-size: 12px;
  }

  .mf-advanced-button {
    width: 100%;
    height: 34px;
    margin-top: 9px;
    border: 1px solid #b8d8cc;
    border-radius: 7px;
    background: #ffffff;
    color: #126f64;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-advanced-button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .mf-results {
    position: absolute;
    top: calc(100% - 6px);
    right: 14px;
    left: 14px;
    z-index: 2;
    max-height: 290px;
    overflow: auto;
    border: 1px solid #cfdcd6;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
  }

  .mf-results button {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    width: 100%;
    padding: 10px;
    border: 0;
    border-bottom: 1px solid #edf2ef;
    background: #ffffff;
    color: #13211a;
    text-align: left;
    cursor: pointer;
  }

  .mf-results button:hover {
    background: #f2faf6;
  }

  .mf-results small,
  .mf-line small {
    display: block;
    margin-top: 3px;
    color: #66766e;
    font-size: 11px;
  }

  .mf-items {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 12px;
  }

  .mf-empty {
    display: grid;
    place-items: center;
    min-height: 180px;
    padding: 22px;
    border: 1px dashed #c8d8d0;
    border-radius: 8px;
    background: #ffffff;
    color: #405047;
    text-align: center;
  }

  .mf-empty p {
    max-width: 260px;
    margin: 7px 0 0;
    color: #6c7c74;
    font-size: 13px;
    line-height: 1.45;
  }

  .mf-restore-button {
    height: 34px;
    margin-top: 12px;
    padding: 0 12px;
    border: 1px solid #b8d8cc;
    border-radius: 7px;
    background: #ffffff;
    color: #126f64;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-restore-button:hover {
    background: #eef8f3;
  }

  .mf-history-list {
    width: 100%;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid #e2ece7;
    text-align: left;
  }

  .mf-history-list > strong {
    display: block;
    margin-bottom: 7px;
    color: #405047;
    font-size: 12px;
  }

  .mf-history-list button {
    display: grid;
    grid-template-columns: 56px 1fr auto;
    gap: 8px;
    align-items: center;
    width: 100%;
    min-height: 30px;
    padding: 5px 7px;
    border: 1px solid #d8e5df;
    border-radius: 6px;
    background: #ffffff;
    color: #405047;
    cursor: pointer;
    font-size: 11px;
    text-align: left;
  }

  .mf-history-list button + button {
    margin-top: 5px;
  }

  .mf-history-list b {
    color: #126f64;
  }

  .mf-line {
    padding: 10px;
    border: 1px solid #dce7e1;
    border-radius: 8px;
    background: #ffffff;
  }

  .mf-line + .mf-line {
    margin-top: 9px;
  }

  .mf-line-main strong {
    display: block;
    max-height: 38px;
    overflow: hidden;
    font-size: 13px;
    line-height: 1.35;
  }

  .mf-line-controls {
    display: grid;
    grid-template-columns: 58px 1fr 30px;
    gap: 7px;
    margin-top: 9px;
  }

  .mf-line-controls input {
    height: 30px;
    padding: 0 7px;
  }

  .mf-line footer {
    margin-top: 8px;
    color: #0b7a6d;
    font-size: 13px;
    font-weight: 800;
    text-align: right;
  }

  .mf-footer {
    padding: 12px 14px 14px;
    border-top: 1px solid #dbe7e1;
    background: #ffffff;
  }

  .mf-footer dl {
    display: grid;
    gap: 7px;
    margin: 0 0 12px;
  }

  .mf-footer dl div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }

  .mf-footer dt {
    color: #53645b;
  }

  .mf-footer dd {
    margin: 0;
    font-weight: 800;
  }

  .mf-footer dl div:last-child {
    padding-top: 7px;
    border-top: 1px solid #e4ece8;
    font-size: 15px;
  }

  .mf-notice {
    margin: 0 0 10px;
    padding: 8px;
    border-radius: 6px;
    background: #eef8f3;
    color: #24584d;
    font-size: 12px;
    line-height: 1.35;
  }

  .mf-primary {
    width: 100%;
    height: 40px;
    border: 0;
    border-radius: 7px;
    background: #128c7e;
    color: #ffffff;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-secondary {
    width: 100%;
    height: 38px;
    margin-bottom: 8px;
    border: 1px solid #b8d8cc;
    border-radius: 7px;
    background: #ffffff;
    color: #126f64;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-secondary:hover {
    background: #eef8f3;
  }

  .mf-secondary:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .mf-primary:hover {
    background: #0f786d;
  }

  .mf-primary:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  .mf-floating-button {
    position: fixed;
    right: 16px;
    bottom: 82px;
    z-index: 2147483647;
    height: 42px;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    background: #128c7e;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.24);
    color: #ffffff;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(17, 24, 39, 0.58);
  }

  .mf-product-modal {
    display: grid;
    grid-template-rows: auto auto minmax(220px, 1fr) auto;
    width: min(1120px, calc(100vw - 48px));
    height: min(760px, calc(100vh - 48px));
    overflow: hidden;
    border: 1px solid #d6b44a;
    border-radius: 8px;
    background: #f8fafc;
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.35);
  }

  .mf-gestion-modal {
    grid-template-rows: auto auto auto minmax(220px, 1fr) auto;
  }

  .mf-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 18px;
    background: #93c5fd;
    border-bottom: 1px solid #73a7e3;
  }

  .mf-modal-header h3 {
    margin: 0;
    color: #123878;
    font-size: 18px;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .mf-modal-header button {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #123878;
    cursor: pointer;
    font-size: 24px;
    line-height: 1;
  }

  .mf-modal-filters {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(150px, 210px) minmax(150px, 210px);
    gap: 12px;
    padding: 16px 18px;
    background: #ffffff;
    border-bottom: 1px solid #dce3ea;
  }

  .mf-modal-filters input[type="text"],
  .mf-modal-filters > input {
    width: 100%;
    height: 44px;
    min-width: 0;
    padding: 0 12px;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    background: #ffffff;
    color: #172033;
    outline: none;
  }

  .mf-modal-filters > input:first-child {
    background: #fffde8;
  }

  .mf-modal-filters input:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.16);
  }

  .mf-modal-filters label {
    display: inline-flex;
    grid-column: 1 / -1;
    align-items: center;
    gap: 8px;
    color: #334155;
    font-size: 13px;
    font-weight: 700;
  }

  .mf-modal-filters label input {
    width: 18px;
    height: 18px;
    accent-color: #123878;
  }

  .mf-gestion-modal-menu {
    display: grid;
    grid-template-columns: repeat(4, minmax(130px, 1fr));
    gap: 8px;
    padding: 12px 18px;
    background: #ffffff;
    border-bottom: 1px solid #dce3ea;
  }

  .mf-gestion-modal-menu button {
    min-height: 34px;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    background: #ffffff;
    color: #334155;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-gestion-modal-menu button.is-active {
    border-color: #2563eb;
    background: #eaf2ff;
    color: #123878;
  }

  .mf-gestion-modal-menu .mf-tab-reenviar.is-active {
    border-color: #ea7d23;
    background: #fff3e4;
    color: #9a4a12;
  }

  .mf-gestion-modal-filters {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    padding: 12px 18px;
    background: #ffffff;
    border-bottom: 1px solid #dce3ea;
  }

  .mf-gestion-modal-filters input {
    width: 100%;
    height: 40px;
    min-width: 0;
    padding: 0 12px;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    background: #fffde8;
    color: #172033;
    outline: none;
  }

  .mf-gestion-modal-filters input:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.16);
  }

  .mf-gestion-modal-filters button {
    min-width: 132px;
    height: 40px;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    background: #ffffff;
    color: #172033;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-product-table-wrap {
    min-height: 0;
    overflow: auto;
    padding: 0 18px;
    background: #f8fafc;
  }

  .mf-product-table {
    width: 100%;
    min-width: 960px;
    border-collapse: collapse;
    color: #172033;
    font-size: 13px;
  }

  .mf-gestion-table {
    min-width: 1000px;
    table-layout: fixed;
  }

  .mf-product-table thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 12px 10px;
    background: #f1f5f9;
    border-bottom: 1px solid #d7dde6;
    color: #334155;
    text-align: left;
  }

  .mf-product-table tbody tr {
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    cursor: pointer;
  }

  .mf-product-table tbody tr:nth-child(even) {
    background: #dcfce7;
  }

  .mf-product-table tbody tr:hover {
    background: #bfdbfe;
  }

  .mf-gestion-table tbody tr,
  .mf-gestion-table tbody tr:nth-child(even),
  .mf-gestion-table tbody tr:hover {
    background: #ffffff;
  }

  .mf-product-table td {
    padding: 10px;
    white-space: nowrap;
  }

  .mf-gestion-table th:nth-child(1),
  .mf-gestion-table td:nth-child(1) {
    width: 22%;
    white-space: normal;
  }

  .mf-gestion-table th:nth-child(2),
  .mf-gestion-table td:nth-child(2) {
    width: 11%;
  }

  .mf-gestion-table th:nth-child(3),
  .mf-gestion-table td:nth-child(3) {
    width: 7%;
  }

  .mf-gestion-table th:nth-child(4),
  .mf-gestion-table td:nth-child(4) {
    width: 11%;
  }

  .mf-gestion-table th:nth-child(5),
  .mf-gestion-table td:nth-child(5) {
    width: 8%;
  }

  .mf-gestion-table th:nth-child(6),
  .mf-gestion-table td:nth-child(6) {
    width: 10%;
  }

  .mf-gestion-table th:nth-child(7),
  .mf-gestion-table td:nth-child(7) {
    width: 8%;
  }

  .mf-gestion-table th:nth-child(8),
  .mf-gestion-table td:nth-child(8),
  .mf-gestion-table th:nth-child(9),
  .mf-gestion-table td:nth-child(9) {
    width: 8%;
  }

  .mf-gestion-table th:nth-child(10),
  .mf-gestion-table td:nth-child(10) {
    width: 7%;
  }

  .mf-gestion-table td strong,
  .mf-gestion-table td span,
  .mf-gestion-table td small {
    display: block;
  }

  .mf-gestion-table td small {
    margin-top: 3px;
    color: #64748b;
    font-size: 12px;
  }

  .mf-gestion-table td small.mf-last-payment-amount,
  .mf-last-payment-amount {
    color: #047857;
    font-weight: 900;
  }

  .mf-gestion-table .mf-days {
    color: #c2410c;
  }

  .mf-gestion-pill {
    display: inline-block !important;
    width: max-content;
    padding: 3px 10px;
    border: 1px solid #fed7aa;
    border-radius: 999px;
    background: #fff7ed;
    color: #c2410c;
    font-size: 12px;
    font-weight: 800;
  }

  .mf-gestion-pill.is-high {
    border-color: #fecaca;
    background: #fee2e2;
    color: #dc2626;
  }

  .mf-product-table td:nth-child(3) {
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mf-product-table td button {
    border: 0;
    background: transparent;
    color: #143b8f;
    cursor: pointer;
    font-weight: 900;
    padding: 0;
  }

  .mf-product-table td .mf-loan-stack {
    display: inline-grid;
    gap: 1px;
    text-align: left;
    line-height: 1.15;
  }

  .mf-product-table td .mf-loan-stack span {
    display: block;
  }

  .mf-product-table td .mf-case-button {
    min-width: 82px;
    min-height: 30px;
    padding: 5px 12px;
    border: 1px solid #dbe3ef;
    border-radius: 7px;
    background: #ffffff;
    color: #172033;
    font-size: 12px;
    font-weight: 800;
  }

  .mf-product-table td .mf-case-button:hover {
    border-color: #93c5fd;
    color: #123878;
  }

  .mf-case-backdrop {
    z-index: 2147483647;
  }

  .mf-case-modal {
    display: grid;
    grid-template-rows: auto auto auto auto minmax(74px, 1fr) auto;
    width: min(1230px, calc(100vw - 48px));
    min-height: min(565px, calc(100vh - 48px));
    max-height: calc(100vh - 48px);
    overflow: hidden;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #ffffff;
    color: #172033;
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.35);
  }

  .mf-case-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 20px;
    border-bottom: 1px solid #e2e8f0;
    background: #ffffff;
  }

  .mf-case-header h3 {
    margin: 0;
    color: #172033;
    font-size: 18px;
    letter-spacing: 0;
  }

  .mf-case-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mf-case-header-actions button,
  .mf-case-action-row button {
    min-height: 34px;
    padding: 0 14px;
    border: 1px solid #dbe3ef;
    border-radius: 7px;
    background: #ffffff;
    color: #172033;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-case-header-actions .mf-danger-outline {
    border-color: #fecaca;
    color: #dc2626;
  }

  .mf-client-active {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 12px;
    border: 1px solid #a7f3d0;
    border-radius: 999px;
    background: #d1fae5;
    color: #047857;
    font-size: 13px;
    font-weight: 900;
  }

  .mf-case-close {
    width: 32px;
    min-width: 32px;
    padding: 0 !important;
    border: 0 !important;
    color: #64748b !important;
    font-size: 20px !important;
  }

  .mf-case-identity {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    border-bottom: 1px solid #e2e8f0;
    background: #ffffff;
  }

  .mf-case-avatar {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
  }

  .mf-case-identity strong {
    display: inline-block;
    margin-right: 18px;
    color: #172033;
    font-size: 20px;
    font-weight: 900;
  }

  .mf-case-identity span {
    display: inline-block;
    margin-right: 16px;
    color: #64748b;
    font-size: 13px;
  }

  .mf-case-summary-grid {
    display: grid;
    grid-template-columns: 1.45fr 1fr;
    gap: 12px;
    padding: 18px 20px 10px;
    background: #ffffff;
  }

  .mf-case-box {
    min-width: 0;
    padding: 14px;
    border: 1px solid #dbe3ef;
    border-radius: 8px;
    background: #ffffff;
  }

  .mf-case-box h4,
  .mf-case-actions h4 {
    margin: 0 0 12px;
    color: #334155;
    font-size: 14px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .mf-case-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px 22px;
  }

  .mf-case-box:nth-child(2) .mf-case-facts {
    grid-template-columns: 1fr;
  }

  .mf-case-facts span {
    color: #64748b;
    font-size: 13px;
  }

  .mf-case-facts b {
    color: #172033;
  }

  .mf-case-facts .mf-danger-text {
    color: #dc2626;
  }

  .mf-case-tabs {
    display: flex;
    gap: 18px;
    padding: 0 20px;
    border-bottom: 1px solid #e2e8f0;
    background: #ffffff;
  }

  .mf-case-tabs button {
    min-height: 44px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: #64748b;
    font-weight: 900;
    cursor: pointer;
  }

  .mf-case-tabs button.is-active {
    border-bottom-color: #2563eb;
    color: #1d4ed8;
  }

  .mf-case-detail-body {
    min-height: 74px;
    max-height: 170px;
    overflow: auto;
    border-bottom: 1px solid #e2e8f0;
    background: #ffffff;
  }

  .mf-case-empty {
    display: grid;
    place-items: center;
    min-height: 74px;
    color: #94a3b8;
    font-size: 13px;
  }

  .mf-case-timeline {
    display: grid;
    gap: 10px;
    padding: 12px 20px;
  }

  .mf-case-timeline article {
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 8px;
    color: #334155;
    font-size: 12px;
  }

  .mf-case-timeline strong,
  .mf-case-timeline span,
  .mf-case-timeline small,
  .mf-case-timeline p {
    display: block;
    margin: 0 0 3px;
  }

  .mf-case-timeline strong {
    color: #172033;
    text-transform: capitalize;
  }

  .mf-case-timeline small,
  .mf-case-timeline span {
    color: #64748b;
  }

  .mf-case-payments {
    display: grid;
    gap: 8px;
    padding: 12px 20px;
  }

  .mf-case-payments div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 10px;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-size: 13px;
  }

  .mf-case-detail-body textarea,
  .mf-case-form-grid textarea,
  .mf-case-form-grid select {
    width: 100%;
    min-width: 0;
    border: 1px solid #dbe3ef;
    border-radius: 7px;
    padding: 10px 12px;
    color: #172033;
    font: inherit;
  }

  .mf-case-detail-body > textarea {
    margin: 12px 20px;
    width: calc(100% - 40px);
  }

  .mf-case-form-grid {
    display: grid;
    gap: 8px;
    padding: 12px 20px;
  }

  .mf-case-form-grid button {
    min-height: 36px;
    border: 1px solid #dbe3ef;
    border-radius: 7px;
    background: #ffffff;
    color: #172033;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-case-actions {
    padding: 14px 20px 18px;
    background: #ffffff;
  }

  .mf-case-action-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(145px, 1fr)) minmax(145px, 1fr) minmax(130px, 1fr);
    gap: 10px;
    margin-bottom: 8px;
  }

  .mf-case-action-row input {
    min-height: 46px;
    min-width: 0;
    padding: 0 12px;
    border: 1px solid #dbe3ef;
    border-radius: 7px;
    color: #334155;
    font: inherit;
  }

  .mf-promise-button {
    width: 100%;
    min-height: 44px;
    border: 0;
    border-radius: 7px;
    background: #102241;
    color: #ffffff;
    font-size: 15px;
    font-weight: 900;
    cursor: pointer;
  }

  .mf-summary-backdrop {
    z-index: 2147483647;
  }

  .mf-readonly-summary {
    width: min(820px, calc(100vw - 48px));
    max-height: calc(100vh - 48px);
    overflow: auto;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #ffffff;
    color: #172033;
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.35);
  }

  .mf-readonly-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 16px 18px;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
  }

  .mf-readonly-header p {
    margin: 0 0 4px;
    color: #64748b;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .mf-readonly-header h3 {
    margin: 0;
    color: #172033;
    font-size: 20px;
    font-weight: 900;
    letter-spacing: 0;
  }

  .mf-readonly-header button {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #64748b;
    font-size: 20px;
    font-weight: 900;
    cursor: pointer;
  }

  .mf-readonly-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 14px 18px 0;
  }

  .mf-readonly-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding: 14px 18px 18px;
  }

  .mf-readonly-grid article {
    min-width: 0;
    padding: 12px;
    border: 1px solid #dbe3ef;
    border-radius: 8px;
    background: #ffffff;
  }

  .mf-readonly-grid strong,
  .mf-readonly-grid span {
    display: block;
  }

  .mf-readonly-grid strong {
    margin-bottom: 8px;
    color: #334155;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .mf-readonly-grid span {
    margin-bottom: 5px;
    color: #64748b;
    font-size: 13px;
  }

  .mf-readonly-grid b {
    color: #172033;
  }

  .mf-readonly-grid .mf-danger-text {
    color: #dc2626;
  }

  .mf-readonly-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 18px;
    border-top: 1px solid #e2e8f0;
    background: #ffffff;
  }

  .mf-readonly-footer button {
    min-width: 130px;
    min-height: 38px;
    border: 1px solid #dbe3ef;
    border-radius: 7px;
    background: #ffffff;
    color: #172033;
    font-size: 13px;
    font-weight: 900;
    cursor: pointer;
  }

  .mf-stock-ok {
    color: #078035;
    font-weight: 900;
    text-align: right;
  }

  .mf-stock-zero {
    color: #e11d2e;
    font-weight: 900;
    text-align: right;
  }

  .mf-price {
    color: #143b8f;
    font-weight: 900;
    text-align: right;
  }

  .mf-table-state {
    padding: 34px 10px !important;
    color: #64748b;
    text-align: center;
  }

  .mf-modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 18px;
    background: #ffffff;
    border-top: 1px solid #dce3ea;
    color: #64748b;
    font-size: 13px;
  }

  .mf-modal-footer button {
    min-width: 140px;
    height: 40px;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    background: #ffffff;
    color: #172033;
    font-weight: 800;
    cursor: pointer;
  }

  @media (max-width: 760px) {
    .mf-panel {
      width: calc(100vw - 16px);
      top: 8px;
      right: 8px;
      bottom: 8px;
    }

    .mf-modal-backdrop {
      padding: 8px;
    }

    .mf-product-modal {
      width: calc(100vw - 16px);
      height: calc(100vh - 16px);
    }

    .mf-modal-filters {
      grid-template-columns: 1fr;
    }

    .mf-product-table {
      min-width: 840px;
    }
  }
`;
