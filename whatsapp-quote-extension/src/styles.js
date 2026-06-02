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

  .mf-summary-strip {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    background: #e8f5ee;
    border-bottom: 1px solid #d6e8df;
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

  .mf-login input {
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

  .mf-product-table td {
    padding: 10px;
    white-space: nowrap;
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
