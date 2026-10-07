/* Where the live menu lives.
   After the admin creates the Gist (beheer.html → "Nieuwe Gist aanmaken"), paste
   its id and owner here and push (the Instellingen tab shows the exact lines).
   Until then every visitor sees data/menu.json. */
export const CONFIG = {
  gistId: 'e0c5aa1e9a848a13ebd6ed472de51b16',
  // GitHub username that owns the gist. Used for a CDN fallback when the API's
  // limit of 60 requests/hour per IP is reached (e.g. many guests on one Wi-Fi).
  gistOwner: 'ryanifa',
  gistFile: 'menu.json',
};
