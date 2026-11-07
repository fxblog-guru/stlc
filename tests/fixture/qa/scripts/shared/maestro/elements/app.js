// app.js — ids shared by every module: the first screen, home, and the sign-in form.
// Replace the values with the ids your app exposes (Android resource-id / iOS accessibilityIdentifier
// / React Native testID). A missing id is a FRAMEWORK-GAP for the mobile developers, never a text
// or coordinate selector.

output.app = {
  ready: 'app-root',
  home: 'home-screen',
};

output.auth = {
  username: 'login-username',
  password: 'login-password',
  submit: 'login-submit',
  error: 'login-error',
};
