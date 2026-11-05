// Email codes for signup and passwords, deleting an account, logging out and switching
module.exports = async ({ SITE, API, check, sleep, waitUntil, post, sentEmails, startRealServer, createDriver, openDashboard }) => {
  // Each flow looks like a different network, so rate limits don't overlap
  let networkNumber = 0;

  const fromNewNetwork = () => ({ "X-Forwarded-For": `10.9.0.${++networkNumber}` });

  const send = (urlPath, body, token) => post(urlPath, body, token, fromNewNetwork());

  const latestCode = (email) => {
    const message = sentEmails
      .filter((sent) => sent.to[0].email === email)
      .at(-1);

    return message?.textContent.match(/\b\d{6}\b/)?.[0];
  };

  const emailsTo = (email) =>
    sentEmails.filter((sent) => sent.to[0].email === email).length;

  const wrongCode = (code) => (code === "000000" ? "000001" : "000000");

  const account = {
    username: "otp_driver",
    email: "otp_driver@example.com",
    password: "otp-driver-password",
    vehicleType: "lorry",
  };

  const login = (username, password) =>
    send("/api/auth/login", { username, password });

  // ---------- Signing up ----------
  const started = await send("/api/auth/register/start", account);
  check("signing up sends a code", started.status === 202 && Boolean(latestCode(account.email)));
  check("the email goes through the API key", sentEmails.at(-1).apiKey === "e2e-only-key");
  check("the sender is the verified address", sentEmails.at(-1).sender.email === "sender@example.com");
  check("no account exists before the code", (await login(account.username, account.password)).status === 401);

  const tooSoon = await send("/api/auth/register/start", account);
  check("a second code has to wait", tooSoon.status === 429 && tooSoon.body.message.includes("seconds"));

  const code = latestCode(account.email);
  const wrong = await send("/api/auth/register/verify", { email: account.email, code: wrongCode(code) });
  check("a wrong code is refused", wrong.status === 400 && wrong.body.message.includes("isn't right"));
  check("a wrong code creates nothing", (await login(account.username, account.password)).status === 401);

  const verified = await send("/api/auth/register/verify", { email: account.email.toUpperCase(), code });
  check("the right code creates the account", verified.status === 201 && verified.body.user.vehicleType === "lorry");

  const loggedIn = await login(account.username, account.password);
  check("the new account can log in", loggedIn.status === 200);

  const used = await send("/api/auth/register/verify", { email: account.email, code });
  check("a code only works once", used.status === 400);

  const duplicate = await send("/api/auth/register/start", { ...account, username: "otp_other" });
  check("an email can't be used twice", duplicate.status === 409);

  check(
    "a made-up email address is refused",
    (await send("/api/auth/register/start", { ...account, username: "otp_bad", email: "not-an-email" })).status === 400
  );

  // ---------- Too many wrong codes ----------
  const guessed = { username: "otp_guessed", email: "otp_guessed@example.com", password: "otp-guessed-password" };
  await send("/api/auth/register/start", guessed);
  const guessedCode = latestCode(guessed.email);

  for (let attempt = 0; attempt < 5; attempt++) {
    await send("/api/auth/register/verify", { email: guessed.email, code: wrongCode(guessedCode) });
  }

  const lockedOut = await send("/api/auth/register/verify", { email: guessed.email, code: guessedCode });
  check("after 5 wrong codes even the right one stops working", lockedOut.status === 400);
  check("so that account wasn't created", (await login(guessed.username, guessed.password)).status === 401);

  // ---------- The test-only signup ----------
  const real = await startRealServer();

  try {
    const direct = await fetch(`${real.url}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "skips_otp", email: "skips_otp@example.com", password: "skips-otp-password" }),
    });

    check("signing up without a code is refused on a real server", direct.status === 410);
  } finally {
    real.stop();
  }

  // ---------- Forgotten password ----------
  const before = sentEmails.length;
  const unknown = await send("/api/auth/password/forgot", { email: "nobody@example.com" });
  await sleep(300);
  check("an unknown email gets the same reply", unknown.status === 200 && unknown.body.message.includes("If that email"));
  check("but no email is sent", sentEmails.length === before);

  const known = await send("/api/auth/password/forgot", { email: account.email });
  check("a known email gets the same reply", known.body.message === unknown.body.message);
  const gotCode = await waitUntil(() => /to change your password/.test(sentEmails.at(-1).textContent));
  check("and gets a code", gotCode);
  const resetCode = latestCode(account.email);

  const token = loggedIn.body.token;
  const screen = await openDashboard(account.username, token);

  const newPassword = "otp-driver-new-password";

  check(
    "a weak new password is refused",
    (await send("/api/auth/password/reset", { email: account.email, code: resetCode, newPassword: "short" })).status === 400
  );
  check(
    "a wrong code can't change the password",
    (await send("/api/auth/password/reset", { email: account.email, code: wrongCode(resetCode), newPassword })).status === 400
  );
  check("the old password still works until then", (await login(account.username, account.password)).status === 200);

  const changed = await send("/api/auth/password/reset", { email: account.email, code: resetCode, newPassword });
  check("the right code changes the password", changed.status === 200);
  check("the old password stops working", (await login(account.username, account.password)).status === 401);
  check("the new password works", (await login(account.username, newPassword)).status === 200);

  const oldLogin = await fetch(`${API}/api/auth/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check("logins from before the change stop working", oldLogin.status === 401);

  await screen.bringToFront();
  check(
    "an open car screen is sent back to log in",
    await waitUntil(() => new URL(screen.url()).pathname === "/")
  );
  await screen.close();

  // ---------- Deleting an account ----------
  const freshToken = (await login(account.username, newPassword)).body.token;

  const remove = (password, authToken) =>
    fetch(`${API}/api/auth/account`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(authToken && { Authorization: `Bearer ${authToken}` }),
      },
      body: JSON.stringify({ password }),
    });

  check("deleting needs a login", (await remove(newPassword)).status === 401);
  check("deleting needs the right password", (await remove("wrong-password", freshToken)).status === 401);
  check("the wrong password deletes nothing", (await login(account.username, newPassword)).status === 200);
  check("the right password deletes the account", (await remove(newPassword, freshToken)).status === 200);
  check("a deleted account can't log in", (await login(account.username, newPassword)).status === 401);

  const deletedLogin = await fetch(`${API}/api/auth/profile`, {
    headers: { Authorization: `Bearer ${freshToken}` },
  });
  check("a deleted account's login stops working", deletedLogin.status === 401);

  const again = await send("/api/auth/register/start", account);
  check("the email can sign up again afterwards", again.status === 429 || again.status === 202);

  // ---------- Logging out and switching on the website ----------
  const firstToken = await createDriver("switch_first");
  await createDriver("switch_second");

  const page = await openDashboard("switch_first", firstToken);

  await page.goto(`${SITE}/switch_second`, { waitUntil: "domcontentloaded" });
  await sleep(500);
  const asked = await page.evaluate(() => document.body.innerText);
  check("another account's address offers to switch", asked.includes("You're logged in as switch_first"));

  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((button) => button.innerText.includes("Back to my dashboard"))
      .click()
  );
  await sleep(600);
  check("you can go back to your own", new URL(page.url()).pathname === "/switch_first");

  await page.waitForSelector('button[aria-label="Account"]');
  check("logging out starts hidden behind the icon", !(await page.$(".cv-menu-note")));
  await page.click('button[aria-label="Account"]');
  await page.waitForSelector(".cv-menu-note");
  await page.evaluate(() =>
    [...document.querySelectorAll(".cv-menu-list button")]
      .find((button) => button.innerText.includes("Log out"))
      .click()
  );
  check("the icon opens a log out button", await waitUntil(() => new URL(page.url()).pathname === "/"));
  check("logging out forgets the login", (await page.evaluate(() => localStorage.getItem("driverSession"))) === null);
  check("the login form starts empty", (await page.$eval('input[type="password"]', (input) => input.value)) === "");

  await page.type('input[type="text"]', "switch_second");
  await page.type('input[type="password"]', "switch_second-password");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".cv-topbar");
  check("then the other account can log in", new URL(page.url()).pathname === "/switch_second");

  await page.goto(`${SITE}/switch_first`, { waitUntil: "domcontentloaded" });
  await sleep(500);
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((button) => button.innerText.includes("Log out and switch"))
      .click()
  );
  await sleep(600);
  check("switching logs out and offers that account", (await page.$eval('input[type="text"]', (input) => input.value)) === "switch_first");
};
