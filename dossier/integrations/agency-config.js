/* EX™ Dossier V3 — public runtime configuration.
 * This file is intentionally safe for GitHub Pages.
 * NEVER place Gemini/Groq keys, Apps Script tokens, service-account JSON,
 * or Firebase Admin credentials here.
 */
window.EX_AGENCY_CONFIG = Object.freeze({
  version: "3.1.0",
  siteId: "agency-dossier",
  sitePath: "/dossier/",
  firebase: Object.freeze({
    apiKey: "AIzaSyCmuzwRyRSr7ILB2P74_dVKCKR4gFzKEeY",
    authDomain: "ex-experience-962ca.firebaseapp.com",
    projectId: "ex-experience-962ca",
    storageBucket: "ex-experience-962ca.firebasestorage.app",
    messagingSenderId: "560048472801",
    appId: "1:560048472801:web:1c8d71c863fc23b41ceda0"
  }),
  functionsRegion: "us-central1",
  adminEmail: "hussambinhassan92@gmail.com",

  // Set this only after registering the GitHub Pages domain in Firebase App Check.
  // Leave blank during the staged migration, then enable enforcement after checking metrics.
  appCheckSiteKey: "",

  maxUploadBytes: 12 * 1024 * 1024,
  maxUploadFiles: 6,
  requestLookupMaxTimeline: 20,

  collections: Object.freeze({
    registrations: "Gate_Registrations",
    legacyEarlyAccess: "VIP_Early_Access",
    users: "Users",
    consultations: "Consultations",
    creativeIntakes: "CreativeIntakes",
    earlyAccess: "EarlyAccess",
    community: "Community_Family",
    ratings: "Experience_Ratings",
    matrixLogs: "MatrixLogs",
    oracleLogs: "OracleLogs",
    activityLogs: "SecurityLogs",
    siteEvents: "SiteEvents",
    metrics: "visitors",
    clientProjects: "ClientProjects",
    publicServices: "Public_Services"
  })
});
