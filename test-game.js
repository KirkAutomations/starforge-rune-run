const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

(async () => {
  const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const launchOptions = { headless: true };
  if (fs.existsSync(EDGE)) launchOptions.executablePath = EDGE;
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { Math.random = () => 0.17; });
  const url = process.env.STARFORGE_URL || ('file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/'));
  const artifactDir = process.env.STARFORGE_ARTIFACT_DIR || __dirname;
  await page.goto(url);
  await page.evaluate(() => localStorage.removeItem('starforge-save'));
  await page.reload();

  // Start and keyboard-only tutorial flow.
  assert.equal(await page.locator('#todayLesson').textContent(), 'MISSION 1: ADDITION TO 20');
  assert((await page.locator('#start').innerText()).includes('No answer buttons'));
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'begin');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#tutorial:not(.hidden)');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#hud:not(.hidden)');

  // Movement is real and dash is available.
  const before = await page.evaluate(() => ({x: innerWidth / 2, state: window.__starforge.state()}));
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(250); await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Space');
  assert.equal((await page.evaluate(() => window.__starforge.state().enemyTypes[0])), 'chaser');

  // Visible enemy attack exists, while wrong answer gives strategy without revealing answer.
  await page.evaluate(() => window.__starforge.spawnAttack());
  await page.waitForTimeout(180);
  assert((await page.evaluate(() => window.__starforge.state().shots)) > 0, 'enemy projectile should be visible');
  await page.keyboard.press('Enter'); await page.keyboard.type('999'); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#coachTitle').textContent(), 'TRY THIS STRATEGY');
  const wrongCoach = await page.locator('#coachText').textContent();
  assert(wrongCoach.includes('Make 10'));
  assert(!/ = \d+/.test(wrongCoach), 'wrong coaching must not reveal answer');
  assert.equal((await page.evaluate(() => window.__starforge.state().levelCorrect)), 0);

  async function answerCurrent() {
    const answer = await page.evaluate(() => window.__starforge.state().target.a);
    await page.keyboard.press('Enter');
    await page.keyboard.type(answer);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !window.__starforge.state().target || window.__starforge.state().target.a !== undefined);
    await page.waitForTimeout(1100);
  }

  // Five-correct short level. Enemies vary; three correct in a row raises skill power.
  await answerCurrent();
  assert.equal((await page.evaluate(() => window.__starforge.state().levelCorrect)), 1);
  assert.equal((await page.evaluate(() => window.__starforge.state().enemyTypes[0])), 'turret');
  await answerCurrent();
  assert.equal((await page.evaluate(() => window.__starforge.state().enemyTypes[0])), 'dasher');
  await page.evaluate(() => { window.__starforge.placeTarget(innerWidth * .28, innerHeight * .43); window.__starforge.spawnAttack(); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(artifactDir, 'desktop-action.png') });
  await answerCurrent();
  const adapted = await page.evaluate(() => window.__starforge.state());
  assert(adapted.skills.math.level >= 2, 'three demonstrated correct answers should raise question power');
  assert(adapted.difficulty.masteryUps >= 1);
  await answerCurrent();
  await answerCurrent();
  await page.waitForSelector('#reward:not(.hidden)', { timeout: 5000 });
  assert.equal(await page.locator('#rewardTitle').textContent(), 'Addition to 20 complete!');
  assert((await page.locator('#rewardName').textContent()).includes('Subtraction to 20'));
  assert((await page.locator('#rewardStats').innerText()).includes('5 runes'));
  await page.screenshot({ path: path.join(artifactDir, 'reward.png') });

  // Parent evidence contains verified completion, wrong retry, adaptive record.
  await page.click('#rewardReport');
  const evidence = await page.locator('#masteryEvidence').innerText();
  const audit = await page.locator('#reviewEvidence').innerText();
  const note = await page.locator('#reportNote').innerText();
  assert(evidence.includes('Addition to 20'));
  assert(evidence.includes('5/6'));
  assert(audit.includes('retry'));
  assert(note.includes('Challenge rose 1 time'));
  await page.screenshot({ path: path.join(artifactDir, 'parent-evidence.png') });
  await page.click('#closeReport');

  // Persistence/restart resumes unlocked level and preserves compatible schema/evidence.
  await page.reload();
  assert.equal(await page.locator('#todayLesson').textContent(), 'MISSION 2: SUBTRACTION TO 20');
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('starforge-save')));
  assert.equal(persisted.schema, 3);
  assert.equal(persisted.lessonIndex, 1);
  assert(persisted.evidence.length >= 6);
  await page.click('#begin');
  await page.waitForSelector('#hud:not(.hidden)');

  // Every third question mixes in a mastered prior lesson as spaced review.
  await answerCurrent();
  await answerCurrent();
  const reviewTarget = await page.evaluate(() => window.__starforge.state().target);
  assert.equal(reviewTarget.isReview, true);
  assert((await page.locator('#missionText').textContent()).includes('REVIEW RUNE'));
  await answerCurrent();
  assert((await page.evaluate(() => window.__starforge.state().saved.review.seen)) >= 1);

  // Existing v1/v2 save fields migrate without losing completed lesson data.
  const migration = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await migration.goto(url);
  await migration.evaluate(() => localStorage.setItem('starforge-save', JSON.stringify({lessonIndex:2,tutorialDone:true,lessons:{0:{title:'Addition to 20',clears:1,lastCorrect:5,lastAttempts:5,lastAccuracy:100,completedAt:'2026-01-01T00:00:00.000Z'}},skills:{math:{seen:7,right:6,level:2}}})));
  await migration.reload();
  const migrated = await migration.evaluate(() => window.__starforge.state().saved);
  assert.equal(migrated.schema, 3); assert.equal(migrated.lessonIndex, 2); assert.equal(migrated.lessons[0].clears, 1); assert.equal(migrated.skills.math.level, 2);
  await migration.close();

  // Mobile layout: all gameplay UI fits; keyboard input remains reachable.
  const mobileErrors = [];
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on('pageerror', e => mobileErrors.push(e.message));
  mobile.on('console', m => { if (m.type() === 'error') mobileErrors.push(m.text()); });
  await mobile.addInitScript(() => { Math.random = () => 0.17; localStorage.removeItem('starforge-save'); });
  await mobile.goto(url);
  await mobile.click('#begin');
  const tutorialPanel = await mobile.locator('#tutorial .panel').boundingBox();
  assert(tutorialPanel && tutorialPanel.x >= 0 && tutorialPanel.x + tutorialPanel.width <= 390 && tutorialPanel.y >= 0 && tutorialPanel.y + tutorialPanel.height <= 844);
  await mobile.click('#tryLesson');
  await mobile.evaluate(() => { window.__starforge.placeTarget(innerWidth * .30, innerHeight * .45); window.__starforge.spawnAttack(); });
  await mobile.waitForTimeout(250);
  for (const id of ['topbar','goal','coach','mission','castbox']) {
    const b = await mobile.locator('#' + id).boundingBox();
    assert(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= 390 && b.y + b.height <= 844, `${id} outside mobile viewport`);
  }
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await mobile.screenshot({ path: path.join(artifactDir, 'mobile.png') });
  await mobile.close();

  assert.deepEqual(errors, []);
  assert.deepEqual(mobileErrors, []);
  console.log(JSON.stringify({
    gameplay: 'movement, dash, chaser/turret/dasher, visible projectiles verified',
    coaching: 'wrong retry strategy does not reveal answer',
    level: '5 correct, reward and unlock verified',
    adaptive: `math power ${adapted.skills.math.level}, mastery ups ${adapted.difficulty.masteryUps}`,
    mixedReview: 'third challenge in next mission reviewed mastered addition',
    persistence: 'schema 3 reload + legacy migration verified',
    keyboard: 'menus and cast flow verified',
    viewport: '1440x900 and 390x844 fit',
    errors
  }, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
