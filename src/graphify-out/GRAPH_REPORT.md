# Graph Report - src  (2026-06-15)

## Corpus Check
- 317 files · ~298,456 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1524 nodes · 5953 edges · 72 communities (67 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `73371849`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_UI Components and Admin|UI Components and Admin]]
- [[_COMMUNITY_Business Health and Finance|Business Health and Finance]]
- [[_COMMUNITY_Client Portfolio and Reports|Client Portfolio and Reports]]
- [[_COMMUNITY_DGII Document Processing|DGII Document Processing]]
- [[_COMMUNITY_Video and Animation Editing|Video and Animation Editing]]
- [[_COMMUNITY_Inventory and Warehouse Management|Inventory and Warehouse Management]]
- [[_COMMUNITY_Stock and Tax Data Processing|Stock and Tax Data Processing]]
- [[_COMMUNITY_Product Catalog and Export|Product Catalog and Export]]
- [[_COMMUNITY_WhatsApp CRM and Messaging|WhatsApp CRM and Messaging]]
- [[_COMMUNITY_Purchasing and Supplier Management|Purchasing and Supplier Management]]
- [[_COMMUNITY_Financial Summaries and Alerts|Financial Summaries and Alerts]]
- [[_COMMUNITY_AI Tools and Forecasting|AI Tools and Forecasting]]
- [[_COMMUNITY_Social Media Management|Social Media Management]]
- [[_COMMUNITY_Admin Dashboard and Security|Admin Dashboard and Security]]
- [[_COMMUNITY_Company Profile and Budgeting|Company Profile and Budgeting]]
- [[_COMMUNITY_User and Permissions Management|User and Permissions Management]]
- [[_COMMUNITY_GPS Device and Alerts|GPS Device and Alerts]]
- [[_COMMUNITY_Ecommerce Storefront|Ecommerce Storefront]]
- [[_COMMUNITY_Printer Settings and Status|Printer Settings and Status]]
- [[_COMMUNITY_Sales and Receipt Printing|Sales and Receipt Printing]]
- [[_COMMUNITY_Receipt Printing and Formatting|Receipt Printing and Formatting]]
- [[_COMMUNITY_Sales and Inventory Operations|Sales and Inventory Operations]]
- [[_COMMUNITY_Label Printing Management|Label Printing Management]]
- [[_COMMUNITY_Marketing and Content Recommendations|Marketing and Content Recommendations]]
- [[_COMMUNITY_Subscription Management|Subscription Management]]
- [[_COMMUNITY_Marketing Settings and AI|Marketing Settings and AI]]
- [[_COMMUNITY_Design Creation and Templates|Design Creation and Templates]]
- [[_COMMUNITY_GPS Alerts and Dashboard|GPS Alerts and Dashboard]]
- [[_COMMUNITY_Web USB Printer Integration|Web USB Printer Integration]]
- [[_COMMUNITY_Branding and Layout Context|Branding and Layout Context]]
- [[_COMMUNITY_GPS Device Management|GPS Device Management]]
- [[_COMMUNITY_GPS Provider Integrations|GPS Provider Integrations]]
- [[_COMMUNITY_QZ Tray Printing Service|QZ Tray Printing Service]]
- [[_COMMUNITY_App Context and Authentication|App Context and Authentication]]
- [[_COMMUNITY_Theme and Notification Contexts|Theme and Notification Contexts]]
- [[_COMMUNITY_Image and Canvas Editing|Image and Canvas Editing]]
- [[_COMMUNITY_Smart Purchasing Panel|Smart Purchasing Panel]]
- [[_COMMUNITY_DGII Certification Processing|DGII Certification Processing]]
- [[_COMMUNITY_Marketing Campaign Content|Marketing Campaign Content]]
- [[_COMMUNITY_AI Alert and Decision Cards|AI Alert and Decision Cards]]
- [[_COMMUNITY_GPS Device Details and Map|GPS Device Details and Map]]
- [[_COMMUNITY_Canva and Design Editor|Canva and Design Editor]]
- [[_COMMUNITY_User Notifications|User Notifications]]
- [[_COMMUNITY_Request Management|Request Management]]
- [[_COMMUNITY_Toast Notifications|Toast Notifications]]
- [[_COMMUNITY_DGII Commercial Approval|DGII Commercial Approval]]
- [[_COMMUNITY_Marketing Calendar|Marketing Calendar]]
- [[_COMMUNITY_Template Gallery|Template Gallery]]
- [[_COMMUNITY_Content Generation Panel|Content Generation Panel]]
- [[_COMMUNITY_Generated Content Preview|Generated Content Preview]]
- [[_COMMUNITY_Accounting and Date Formatting|Accounting and Date Formatting]]
- [[_COMMUNITY_Metrics and Financial Data|Metrics and Financial Data]]
- [[_COMMUNITY_GPS Dashboard Statistics|GPS Dashboard Statistics]]
- [[_COMMUNITY_GPS Devices List|GPS Devices List]]
- [[_COMMUNITY_Error Handling|Error Handling]]
- [[_COMMUNITY_Post Performance Scoring|Post Performance Scoring]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 246 edges
2. `useAuth()` - 207 edges
3. `Button` - 151 edges
4. `supabase` - 130 edges
5. `Input` - 94 edges
6. `Label` - 90 edges
7. `formatInTimeZone()` - 66 edges
8. `Code Citations` - 65 edges
9. `usePanels()` - 64 edges
10. `Table` - 57 edges

## Surprising Connections (you probably didn't know these)
- `AppContent()` --calls--> `useAuth()`  [EXTRACTED]
  App.jsx → contexts/SupabaseAuthContext.jsx
- `DgiiRepresentacionImpresaRunner()` --calls--> `pad()`  [INFERRED]
  components/configuracion/DgiiRepresentacionImpresaRunner.jsx → lib/dgiiExport.js
- `useClients()` --calls--> `useToast()`  [EXTRACTED]
  hooks/useSupabase.js → components/ui/use-toast.js
- `useFacturas()` --calls--> `useToast()`  [EXTRACTED]
  hooks/useSupabase.js → components/ui/use-toast.js
- `useProducts()` --calls--> `useToast()`  [EXTRACTED]
  hooks/useSupabase.js → components/ui/use-toast.js

## Import Cycles
- 3-file cycle: `contexts/PanelContext.jsx -> pages/gps/GpsMapPage.jsx -> pages/gps/GpsPageShell.jsx -> contexts/PanelContext.jsx`
- 3-file cycle: `contexts/PanelContext.jsx -> pages/gps/GpsAlertsPage.jsx -> pages/gps/GpsPageShell.jsx -> contexts/PanelContext.jsx`
- 3-file cycle: `contexts/PanelContext.jsx -> pages/gps/GpsDashboardPage.jsx -> pages/gps/GpsPageShell.jsx -> contexts/PanelContext.jsx`
- 3-file cycle: `contexts/PanelContext.jsx -> pages/gps/GpsDeviceDetailPage.jsx -> pages/gps/GpsPageShell.jsx -> contexts/PanelContext.jsx`
- 3-file cycle: `contexts/PanelContext.jsx -> pages/gps/GpsDevicesPage.jsx -> pages/gps/GpsPageShell.jsx -> contexts/PanelContext.jsx`
- 3-file cycle: `contexts/PanelContext.jsx -> pages/gps/GpsFinancingPage.jsx -> pages/gps/GpsPageShell.jsx -> contexts/PanelContext.jsx`
- 3-file cycle: `components/dashboard/AprobacionesPendientesAlert.jsx -> contexts/PanelContext.jsx -> pages/HomePage.jsx -> components/dashboard/AprobacionesPendientesAlert.jsx`
- 4-file cycle: `components/ai-ceo/AiAlertCard.jsx -> contexts/PanelContext.jsx -> pages/AICeoPage.jsx -> components/ai-ceo/AiAlertsList.jsx -> components/ai-ceo/AiAlertCard.jsx`

## Communities (72 total, 5 thin omitted)

### Community 0 - "UI Components and Admin"
Cohesion: 0.21
Nodes (17): ClienteFormModal(), FORMATS_TO_SUPPORT, VendedorFormModal(), FORMAS_PAGO, FORMAS_PAGO, TIPOS, TONOS, TABS (+9 more)

### Community 1 - "Business Health and Finance"
Cohesion: 0.07
Nodes (70): EditUserModal(), CierreCajaPage(), DENOMINACIONES, formatCurrency(), emptyForm, TIPOS_NCF, PROVEEDORES, CotizacionMagnaFormModal() (+62 more)

### Community 2 - "Client Portfolio and Reports"
Cohesion: 0.11
Nodes (30): ESTADOS, TIPOS_ECF, money(), n(), toDateOnly(), tones, vencimiento(), initialState (+22 more)

### Community 3 - "DGII Document Processing"
Cohesion: 0.14
Nodes (13): ACCEPTED_ESTADOS, DgiiSimulacionRunner(), encf(), ESTADOS, FINAL_ESTADOS, generarCasos(), getInitialCasos(), normalizeDgiiStatus() (+5 more)

### Community 4 - "Video and Animation Editing"
Cohesion: 0.07
Nodes (31): ANIMATIONS, ASPECTS, buildVideoFilterCss(), CaptutPro(), createDefaultTracks(), DEFAULT_COLOR_ADJUST, DEFAULT_TEXT, drawEditedFrame() (+23 more)

### Community 5 - "Inventory and Warehouse Management"
Cohesion: 0.06
Nodes (58): create(), deactivate(), getActivos(), getByCodigo(), getById(), search(), update(), create() (+50 more)

### Community 6 - "Stock and Tax Data Processing"
Cohesion: 0.09
Nodes (29): calculateStock(), inventory_movements, products, ProductEcommerceTab(), ProductPlaceholderTab(), cleanRncCedula(), downloadTxt(), fmtFecha() (+21 more)

### Community 7 - "Product Catalog and Export"
Cohesion: 0.21
Nodes (13): useCatalogData(), exportToExcel(), nombreById(), orNull(), AlertasGerencialesPage(), InventarioFisicoPage(), ProductsPage(), ChangeProductCodeModal() (+5 more)

### Community 8 - "WhatsApp CRM and Messaging"
Cohesion: 0.08
Nodes (31): LayoutContext, LayoutProvider(), useLayout(), channelMeta, cleanPhone(), conversationStatusLabels, conversationStatusOptions, conversationStatusStyles (+23 more)

### Community 9 - "Purchasing and Supplier Management"
Cohesion: 0.06
Nodes (44): SuplidorFormModal(), CompraDetalles(), CompraFooter(), CompraHeader(), CompraInteligentePanel(), fmt(), SALUD, URG_BADGE (+36 more)

### Community 10 - "Financial Summaries and Alerts"
Cohesion: 0.06
Nodes (65): SummaryCard(), CommitmentFormModal(), CommitmentsCard(), formatCurrency(), HybridFinancialOverviewCard(), formatCurrency(), PayCommitmentModal(), formatCurrency() (+57 more)

### Community 11 - "AI Tools and Forecasting"
Cohesion: 0.09
Nodes (19): AiAlertCard(), ALERT_TYPE_TO_PANEL, AREA_ICONS, AiAlertsList(), ALERT_TYPES, AiForecastCard(), fmtMoney(), AiPriorityBadge() (+11 more)

### Community 12 - "Social Media Management"
Cohesion: 0.07
Nodes (33): AgentLearningPanel(), CONFIANZA, ContentRecommendationPanel(), fmt(), Kpi(), MarketingMetricsDashboard(), ProductImpactCard(), PLATFORMS (+25 more)

### Community 13 - "Admin Dashboard and Security"
Cohesion: 0.06
Nodes (67): AdminDashboard(), MasterPanel(), AiCeoChat(), AiDecisionsList(), AiSettingsPanel(), MarketingSettingsPanel(), SocialAccountsConnector(), SocialPostsManager() (+59 more)

### Community 14 - "Company Profile and Budgeting"
Cohesion: 0.15
Nodes (13): BarcodeScanner(), MultiSearchableSelect(), SearchableSelect(), CLIENTE_GENERICO, MoneyInput, PRIO_BADGE, MoneyInput, sendNotaToSuplidorVirtual() (+5 more)

### Community 15 - "User and Permissions Management"
Cohesion: 0.18
Nodes (8): App(), AppContent(), LoginForm(), PanelProvider(), AuthProvider(), WhatsAppNotificationContext, WhatsAppNotificationProvider(), RegistroEmpresaPage()

### Community 16 - "GPS Device and Alerts"
Cohesion: 0.16
Nodes (8): latestByDevice(), provider, buildMockAlerts(), mockGeofences, mockGpsDevices, mockGpsHistory, mockGpsPositions, now

### Community 17 - "Ecommerce Storefront"
Cohesion: 0.16
Nodes (13): CartPanel(), formatPrice(), ProductCard(), ProductDetailView(), TiendaAvisarmeModal(), TiendaPage(), WhatsAppFloatingButton(), buildWhatsAppUrl() (+5 more)

### Community 18 - "Printer Settings and Status"
Cohesion: 0.20
Nodes (20): PrinterSettings(), agentGetHealth(), agentGetJob(), agentGetJobs(), agentGetPrinterStatus(), agentInvalidateCache(), agentIsAvailable(), AgentJob (+12 more)

### Community 19 - "Sales and Receipt Printing"
Cohesion: 0.38
Nodes (12): printCotizacionQZ(), printFacturaQZ(), printReciboIngresoQZ(), findLabelPrinter(), findReceiptPrinter(), getPreferredBackend(), listPrinters(), listPrintersForKind() (+4 more)

### Community 20 - "Receipt Printing and Formatting"
Cohesion: 0.25
Nodes (19): buildCotizacionEscPos(), buildFacturaEscPos(), buildHeader(), buildReciboIngresoEscPos(), centerLine(), CMD, CotizacionData, CotizacionDetalle (+11 more)

### Community 21 - "Sales and Inventory Operations"
Cohesion: 0.03
Nodes (65): Code Citations, License: desconocido, License: desconocido, License: desconocido, License: desconocido, License: desconocido, License: desconocido, License: desconocido (+57 more)

### Community 22 - "Label Printing Management"
Cohesion: 0.23
Nodes (12): encodeAlphaPrice(), EtiquetasMasivasPage(), MURCIELAGO_KEY, PREFERRED_PRINTERS, encodeAlphaPrice(), MURCIELAGO_KEY, PREFERRED_PRINTERS, PrintLabelModal() (+4 more)

### Community 23 - "Marketing and Content Recommendations"
Cohesion: 0.08
Nodes (21): getDiasRestantes(), normalizeSuscripcion(), normalizeTenant(), AdminEmpresaDetalle(), SUGGESTED_PROMPTS, SETTING_META, descargarRespaldoTenant(), TABLAS (+13 more)

### Community 24 - "Subscription Management"
Cohesion: 0.17
Nodes (11): PlanGate(), SuscripcionAlert(), SuscripcionBlocker(), SuscripcionContext, SuscripcionProvider(), useSuscripcion(), SuscripcionStatusCard(), useSuscripcionGuard() (+3 more)

### Community 25 - "Marketing Settings and AI"
Cohesion: 0.10
Nodes (23): ContentGeneratorPanel(), ESTADO_BADGE, GeneratedContentPreview(), CANAL_COLOR, DIAS, iso(), MarketingCalendar(), startOfWeek() (+15 more)

### Community 26 - "Design Creation and Templates"
Cohesion: 0.15
Nodes (19): CanvaEditor(), DesignsList(), STATUS_LABELS, STATUS_STYLES, MotoflowStudioEditor, TemplatePickerModal(), injectAiCopy(), VIEW_TABS (+11 more)

### Community 27 - "GPS Alerts and Dashboard"
Cohesion: 0.24
Nodes (11): GpsAlertsPage(), GpsAlertTable(), GpsDashboardPage(), cards, GpsDashboardStats(), GpsMapPage(), getGpsAlerts(), getGpsDashboardStats() (+3 more)

### Community 28 - "Web USB Printer Integration"
Cohesion: 0.24
Nodes (19): printCotizacionWebUsb(), findBulkOutEndpoint(), getDeviceName(), getSavedDeviceInfo(), isWebUsbSupported(), LABEL_PRINTER_FILTERS, PRINTER_FILTERS, RECEIPT_PRINTER_FILTERS (+11 more)

### Community 29 - "Branding and Layout Context"
Cohesion: 0.22
Nodes (6): Logo(), MotoFlowLogo(), JarvisAdminAssistant(), Header(), MainLayout(), setEmpresaPrintConfig()

### Community 30 - "GPS Device Management"
Cohesion: 0.24
Nodes (8): GpsDeviceCard(), GpsFinancialRiskTable(), GpsStatusBadge(), labels, styles, labels, RiskBadge(), styles

### Community 31 - "GPS Provider Integrations"
Cohesion: 0.16
Nodes (4): ConcoxProvider, GpsProvider, TeltonikaProvider, TraccarProvider

### Community 32 - "QZ Tray Printing Service"
Cohesion: 0.24
Nodes (9): importPrivateKey(), qzEnsureConnection(), qzFindBestPrinter(), qzFindReceiptPrinter(), qzPrintRawEpl(), qzPrintRawEscPos(), qzTrayService, setupQzSecurity() (+1 more)

### Community 33 - "App Context and Authentication"
Cohesion: 0.21
Nodes (12): FacturacionContext, FacturacionProvider(), useFacturacion(), useVentas(), findAlmacenPrincipal(), printFacturaWebUsb(), CotizacionPage(), VentasPage() (+4 more)

### Community 34 - "Theme and Notification Contexts"
Cohesion: 0.11
Nodes (21): RouteGuard(), usePanels(), ThemeContext, ThemeProvider(), useTheme(), useWhatsAppNotifications(), AprobacionesPendientesAlert(), CatalogManagementModal() (+13 more)

### Community 35 - "Image and Canvas Editing"
Cohesion: 0.17
Nodes (6): clone(), colorToCanvas(), computeImagePlacement(), drawElement(), drawWrappedText(), normalizeDocument()

### Community 36 - "Smart Purchasing Panel"
Cohesion: 0.25
Nodes (17): buildSlots(), buildDgiiQrUrl(), formatDgiiDate(), formatDgiiDateTime(), formatMoney(), generateRepresentacionImpresaPdfFromData(), getDisplayItemItbis(), getItems() (+9 more)

### Community 37 - "DGII Certification Processing"
Cohesion: 0.20
Nodes (7): ACCEPTED_ESTADOS, ESTADOS, FINAL_ESTADOS, isCasoAceptado(), isRfceListoParaFacturaCompleta(), LOCAL_READY_ESTADOS, responseText()

### Community 38 - "Marketing Campaign Content"
Cohesion: 0.15
Nodes (12): agradecimientoCliente, bannerNegocio, catalogoGrid, COLORS, comparativaAntesDespues, comunicadoUrgente, nuevoProducto, ofertaDelDia (+4 more)

### Community 39 - "AI Alert and Decision Cards"
Cohesion: 0.36
Nodes (6): InsightsBanner(), PRIORIDAD_STYLE, TIPO_ALERTA_LABEL, AREA_EMOJI, buildAiCeoWhatsAppMessage(), buildAiCeoWhatsAppUrl()

### Community 40 - "GPS Device Details and Map"
Cohesion: 0.25
Nodes (7): GpsDeviceDetailPage(), bounds, colors, GpsMap(), getGpsDeviceById(), getGpsPositions(), GpsTimeline()

### Community 42 - "User Notifications"
Cohesion: 0.52
Nodes (5): checkOverdueCredits(), fetchRecent(), fetchUnreadCount(), markAsRead(), subscribeRealtime()

### Community 43 - "Request Management"
Cohesion: 0.44
Nodes (7): cerrarSolicitud(), createSolicitud(), eliminarSolicitud(), enviarSolicitudAPedido(), fetchSolicitudes(), marcarSolicitado(), updateSolicitud()

### Community 44 - "Toast Notifications"
Cohesion: 0.31
Nodes (8): Toast, ToastAction, ToastClose, ToastDescription, ToastTitle, toastVariants, ToastViewport, Toaster()

### Community 45 - "DGII Commercial Approval"
Cohesion: 0.29
Nodes (4): DgiiAprobacionComercialRunner(), ESTADOS, normalizeResult(), responseText()

### Community 46 - "Marketing Calendar"
Cohesion: 0.21
Nodes (6): ACCEPTED_ESTADOS, caseMatchesSlot(), montoFromCaso(), normalizeText(), numberFromValue(), REQUERIDOS_PASO_5

### Community 47 - "Template Gallery"
Cohesion: 0.16
Nodes (11): CATEGORY_COLORS, CATEGORY_LABELS, FORMAT_HINT, TemplatesGallery(), money(), n(), statusTone, tones (+3 more)

### Community 48 - "Content Generation Panel"
Cohesion: 0.18
Nodes (4): groupIcons, severityClasses, severityRank, toneClasses

### Community 49 - "Generated Content Preview"
Cohesion: 0.31
Nodes (8): EstadoResultadosPage(), hoyISO(), Metric(), MiniTotal(), money(), n(), pct(), primerDiaMesISO()

### Community 51 - "Metrics and Financial Data"
Cohesion: 0.33
Nodes (6): Metric(), metricTone, Mini(), money(), n(), pct()

### Community 52 - "GPS Dashboard Statistics"
Cohesion: 0.33
Nodes (5): AiDecisionCard(), STATUS_LABEL, STATUS_STYLE, AiRiskBadge(), STYLES

### Community 53 - "GPS Devices List"
Cohesion: 0.24
Nodes (8): PanelContext, GpsDeviceForm(), GpsDevicesPage(), GpsFinancingPage(), GpsPageShell(), tabs, getFinancialRiskRows(), getGpsDevices()

### Community 62 - "Community 62"
Cohesion: 0.20
Nodes (9): Anti-patrones a evitar, Convención, Cómo hacer una migración, Estado actual, Plan de migración por feature, ¿Por qué no se hizo de una vez?, Reglas no negociables al mover una feature, `src/features/` (+1 more)

### Community 63 - "Community 63"
Cohesion: 0.24
Nodes (5): getVencimiento(), money(), n(), toDateOnly(), tones

### Community 64 - "Community 64"
Cohesion: 0.28
Nodes (7): DgiiCertificacionRunner(), AMBIENTES, DgiiCertificadoUploader(), DgiiRepresentacionImpresaRunner(), downloadRepresentacionImpresa(), downloadRepresentacionImpresaFromData(), generateRepresentacionImpresaPdf()

### Community 65 - "Community 65"
Cohesion: 0.28
Nodes (6): docFields, emptyForm, getPlacaEstadoStyle(), PlacaEstadoLegend(), PlacaEstadoMarker(), placaEstadoStyles

### Community 66 - "Community 66"
Cohesion: 0.43
Nodes (3): safeSlug(), saveProductImageUrl(), uploadProductImage()

### Community 67 - "Community 67"
Cohesion: 0.29
Nodes (6): Convención, Estructura, Migración progresiva, Reglas, `src/repositories/`, Uso

### Community 68 - "Community 68"
Cohesion: 0.40
Nodes (4): BREAKDOWN_ICONS, BusinessHealthCard(), fmtMoney(), STATUS_CONFIG

### Community 69 - "Community 69"
Cohesion: 0.60
Nodes (4): DEFAULT_COLORS, getBrandKit(), saveBrandKit(), uploadBrandLogo()

### Community 71 - "Community 71"
Cohesion: 0.40
Nodes (6): metricForPrice(), money(), n(), pct(), priceForRealMargin(), roundPrice()

## Knowledge Gaps
- **286 isolated node(s):** `ALERT_TYPE_TO_PANEL`, `AREA_ICONS`, `ALERT_TYPES`, `SUGGESTED_PROMPTS`, `STATUS_STYLE` (+281 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useToast()` connect `Admin Dashboard and Security` to `UI Components and Admin`, `Business Health and Finance`, `Client Portfolio and Reports`, `DGII Document Processing`, `Video and Animation Editing`, `Stock and Tax Data Processing`, `Product Catalog and Export`, `WhatsApp CRM and Messaging`, `Purchasing and Supplier Management`, `Financial Summaries and Alerts`, `AI Tools and Forecasting`, `Social Media Management`, `Company Profile and Budgeting`, `User and Permissions Management`, `Printer Settings and Status`, `Label Printing Management`, `Marketing and Content Recommendations`, `Subscription Management`, `Marketing Settings and AI`, `Design Creation and Templates`, `App Context and Authentication`, `Theme and Notification Contexts`, `DGII Certification Processing`, `AI Alert and Decision Cards`, `Canva and Design Editor`, `User Notifications`, `Request Management`, `Toast Notifications`, `DGII Commercial Approval`, `Marketing Calendar`, `Template Gallery`, `Content Generation Panel`, `Generated Content Preview`, `Accounting and Date Formatting`, `Metrics and Financial Data`, `Community 63`, `Community 64`, `Community 65`, `Community 66`, `Community 69`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Why does `supabase` connect `Marketing and Content Recommendations` to `UI Components and Admin`, `Business Health and Finance`, `Client Portfolio and Reports`, `DGII Document Processing`, `Video and Animation Editing`, `Inventory and Warehouse Management`, `Stock and Tax Data Processing`, `Product Catalog and Export`, `WhatsApp CRM and Messaging`, `Purchasing and Supplier Management`, `Financial Summaries and Alerts`, `AI Tools and Forecasting`, `Social Media Management`, `Company Profile and Budgeting`, `User and Permissions Management`, `Ecommerce Storefront`, `Label Printing Management`, `Subscription Management`, `Marketing Settings and AI`, `Design Creation and Templates`, `Branding and Layout Context`, `App Context and Authentication`, `Theme and Notification Contexts`, `DGII Certification Processing`, `AI Alert and Decision Cards`, `Canva and Design Editor`, `User Notifications`, `Request Management`, `DGII Commercial Approval`, `Marketing Calendar`, `Template Gallery`, `Content Generation Panel`, `Generated Content Preview`, `Accounting and Date Formatting`, `Metrics and Financial Data`, `Community 63`, `Community 64`, `Community 65`, `Community 66`, `Community 69`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `Button` connect `UI Components and Admin` to `Business Health and Finance`, `Client Portfolio and Reports`, `DGII Document Processing`, `Video and Animation Editing`, `Stock and Tax Data Processing`, `WhatsApp CRM and Messaging`, `Purchasing and Supplier Management`, `Financial Summaries and Alerts`, `AI Tools and Forecasting`, `Social Media Management`, `Admin Dashboard and Security`, `Company Profile and Budgeting`, `Printer Settings and Status`, `Label Printing Management`, `Marketing and Content Recommendations`, `Subscription Management`, `Marketing Settings and AI`, `Design Creation and Templates`, `Branding and Layout Context`, `Theme and Notification Contexts`, `Image and Canvas Editing`, `DGII Certification Processing`, `AI Alert and Decision Cards`, `Canva and Design Editor`, `DGII Commercial Approval`, `Marketing Calendar`, `Template Gallery`, `Content Generation Panel`, `Generated Content Preview`, `Accounting and Date Formatting`, `Metrics and Financial Data`, `GPS Dashboard Statistics`, `Community 63`, `Community 64`, `Community 65`, `Community 66`, `Community 69`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **What connects `ALERT_TYPE_TO_PANEL`, `AREA_ICONS`, `ALERT_TYPES` to the rest of the system?**
  _286 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Business Health and Finance` be split into smaller, more focused modules?**
  _Cohesion score 0.06961506961506962 - nodes in this community are weakly interconnected._
- **Should `Client Portfolio and Reports` be split into smaller, more focused modules?**
  _Cohesion score 0.11469534050179211 - nodes in this community are weakly interconnected._
- **Should `DGII Document Processing` be split into smaller, more focused modules?**
  _Cohesion score 0.13852813852813853 - nodes in this community are weakly interconnected._