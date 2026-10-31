'use client';

import { NotificationSettings } from '@/components/notify';
import { Callout } from '@/components/callout';
import { PhoneHint, useTouched } from '@/components/phone-hint';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { updateProfile, changePassword, setup2FA, verify2FA, disable2FA, getTransferPinStatus, setTransferPin, changeTransferPin } from '@/lib/api';
import { PageHeader } from '@/components/brand';
import { VerifyEmailRow } from '@/components/verify-email-modal';
import { IdentityForm } from '@/components/identity-form';
import { UserRole } from '@pitchaside/shared';
import { SettingsSection, SettingsSections } from '@/components/group/settings-sections';

const ICONS = {
  // A person
  person: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
  // An ID card
  id: 'M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z',
  // A padlock
  pin: 'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z',
  // A key
  key: 'M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z',
  // A shield with a tick
  shield: 'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z',
};

/** A small heading over each group of settings. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-5 mb-1.5 px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">{children}</h2>;
}

/** The card each group sits in; the rows run edge to edge inside it. */
const card = 'bg-white rounded-3xl border border-gray-100 shadow-card overflow-hidden px-5 sm:px-7 [&>div]:border-y-0';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  // Profile state
  const phoneSeen = useTouched();
  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [pwData, setPwData] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  // 2FA state
  const [twoFASetup, setTwoFASetup] = useState<{ qrCodeUrl: string; secret: string } | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [setting2FA, setSetting2FA] = useState(false);

  // Transfer PIN state
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pinData, setPinData] = useState({ currentPin: '', newPin: '', confirmPin: '' });
  const [savingPin, setSavingPin] = useState(false);

  const holdsMoney = !!user && [UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN, UserRole.PITCH_OWNER].includes(user.role);
  // Which setting is open: one at a time. A link to #identity (the home banner) opens BVN and NIN.
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (k: string) => setOpen((o) => (o === k ? null : k));
  useEffect(() => {
    let t = 0;
    const openFromHash = () => {
      if (window.location.hash !== '#identity') return;
      setOpen('identity');
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const row = document.getElementById('identity')?.previousElementSibling as HTMLElement | null;
        if (row) window.scrollTo({ top: row.getBoundingClientRect().top + window.scrollY - 16 });
      }, 350);
    };
    openFromHash();
    // Also when only the # changes (already on Settings)
    window.addEventListener('hashchange', openFromHash);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('hashchange', openFromHash);
    };
  }, []);

  useEffect(() => {
    getTransferPinStatus().then((r) => setHasPin(r.hasPin)).catch(() => {});
  }, []);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile({
        firstName: profileData.firstName.trim(),
        lastName: profileData.lastName.trim(),
        phone: profileData.phone.trim(),
      });
      await refreshUser();
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (pwData.newPassword !== pwData.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setSavingPw(true);
    try {
      await changePassword({
        currentPassword: pwData.currentPassword,
        newPassword: pwData.newPassword,
      });
      setPwData({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setSavingPw(false);
    }
  }

  async function handleSetup2FA() {
    setSetting2FA(true);
    try {
      const data = await setup2FA();
      setTwoFASetup(data);
    } catch (err: any) {
      toast.error(err.message || 'Two-step sign-in didn’t start. Try again.');
    } finally {
      setSetting2FA(false);
    }
  }

  async function handleVerify2FA() {
    setSetting2FA(true);
    try {
      await verify2FA(twoFACode);
      setTwoFASetup(null);
      setTwoFACode('');
      await refreshUser();
      toast.success('Two-step sign-in is on');
    } catch (err: any) {
      toast.error(err.message || 'Invalid code');
    } finally {
      setSetting2FA(false);
    }
  }

  async function handleDisable2FA() {
    setSetting2FA(true);
    try {
      await disable2FA(disableCode);
      setDisableCode('');
      await refreshUser();
      toast.success('Two-step sign-in is off');
    } catch (err: any) {
      toast.error(err.message || 'Invalid code');
    } finally {
      setSetting2FA(false);
    }
  }

  async function handlePinSave(e: React.FormEvent) {
    e.preventDefault();
    if (pinData.newPin !== pinData.confirmPin) {
      toast.error('PINs do not match');
      return;
    }
    setSavingPin(true);
    try {
      if (hasPin) {
        await changeTransferPin(pinData.currentPin, pinData.newPin);
        toast.success('Transfer PIN changed');
      } else {
        await setTransferPin(pinData.newPin);
        toast.success('Transfer PIN set');
        setHasPin(true);
      }
      setPinData({ currentPin: '', newPin: '', confirmPin: '' });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update PIN');
    } finally {
      setSavingPin(false);
    }
  }

  if (!user) return null;

  const inputClass = "w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600";

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <PageHeader eyebrow="Your account" title="Settings" subtitle="Profile, password and security" />

      <div className="mb-4">
        <NotificationSettings side="organiser" emailOn={user.emailNotices !== false} email={user.email} onEmailChanged={() => refreshUser()} />
        <p className="text-[12px] leading-snug text-gray-500 mt-1.5 px-1">When money lands, when to send the link to the group, and when voting closes.</p>
      </div>

      {/* Everything else as rows that say where it stands; tap one to change it, one open at a time */}
      <GroupLabel>You</GroupLabel>
      <div className={card}>
        <SettingsSections inset="card">
          <SettingsSection
            id="s-profile"
            icon={ICONS.person}
            title="Profile"
            summary={[`${user.firstName} ${user.lastName}`, user.phone].filter(Boolean).join(' · ')}
            open={open === 'profile'}
            onToggle={() => toggle('profile')}
          >
            <form onSubmit={handleProfileSave}>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">First name</label>
            <input
              type="text"
              required
              minLength={2}
              value={profileData.firstName}
              onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Last name</label>
            <input
              type="text"
              required
              minLength={2}
              value={profileData.lastName}
              onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Phone number</label>
          <input
            type="tel"
            value={profileData.phone}
            onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
            onBlur={phoneSeen.onBlur}
            placeholder="0803 123 4567"
            className={inputClass}
          />
          <PhoneHint value={profileData.phone ?? ''} touched={phoneSeen.touched}>Optional: so your players and co-organisers can reach you.</PhoneHint>
        </div>
        <VerifyEmailRow email={user.email} verified={!!user.emailVerified} onCheck={refreshUser} />
        <button
          type="submit"
          disabled={savingProfile}
          className="w-full py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
        >
          {savingProfile ? 'Saving…' : 'Update profile'}
        </button>
            </form>
          </SettingsSection>
        </SettingsSections>
      </div>

      {/* Who holds money: admins, and pitch owners (their pitch account needs BVN or NIN too) */}
      {(holdsMoney || hasPin !== null) && (
        <>
          <GroupLabel>Money</GroupLabel>
          <div className={card}>
            <SettingsSections inset="card">
              {holdsMoney && (
                <SettingsSection
                  id="identity"
                  icon={ICONS.id}
                  title="BVN and NIN"
                  summary={user.bvn && user.nin ? 'Both added' : user.bvn ? 'Add your NIN too' : user.nin ? 'Add your BVN too' : 'Needed before players can pay'}
                  open={open === 'identity'}
                  onToggle={() => toggle('identity')}
                >
                  <div>
        {user?.bvn && user?.nin ? (
          <p className="text-sm text-gray-600 mb-3 flex items-start gap-2">
            <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-volt-300 text-ink flex items-center justify-center" aria-hidden>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
            </span>
            <span>
              <b className="text-ink">Both added</b>: BVN {user.bvn} · NIN {user.nin}. Your groups can open collection accounts.
            </span>
          </p>
        ) : user?.bvn || user?.nin ? (
          <Callout tone="note" className="mb-4" title={`Add your ${user.bvn ? 'NIN' : 'BVN'} too`}>
            {user.bvn ? `BVN ${user.bvn} added.` : `NIN ${user.nin} added.`} The bank needs both.
          </Callout>
        ) : (
          <Callout tone="note" className="mb-4" title="Add your BVN and NIN">
            Players can’t pay you in the app until then.
          </Callout>
        )}
        <IdentityForm submitLabel={user?.bvn || user?.nin ? 'Save' : 'Add'} onDone={() => toast.success('Saved: your BVN and NIN are on file')} />
                  </div>
                </SettingsSection>
              )}
              {hasPin !== null && (
                <SettingsSection
                  id="s-pin"
                  icon={ICONS.pin}
                  title="Transfer PIN"
                  summary={hasPin ? 'Set · asked before money goes out' : 'Not set · needed to send money'}
                  open={open === 'pin'}
                  onToggle={() => toggle('pin')}
                >
                  <form onSubmit={handlePinSave}>
          <p className="text-xs text-gray-500 mb-4">
            {hasPin
              ? 'Enter your current PIN and choose a new 4‑digit PIN.'
              : 'Set a 4‑digit PIN to authorise payouts from group accounts.'}
          </p>
          <div className="space-y-3 mb-4">
            {hasPin && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Current PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  required
                  maxLength={4}
                  value={pinData.currentPin}
                  onChange={(e) => setPinData({ ...pinData, currentPin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  placeholder="••••"
                  className={`${inputClass} text-center tracking-[0.3em]`}
                  autoComplete="off"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                {hasPin ? 'New PIN' : 'PIN'}
              </label>
              <input
                type="password"
                inputMode="numeric"
                required
                maxLength={4}
                value={pinData.newPin}
                onChange={(e) => setPinData({ ...pinData, newPin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="Enter 4‑digit PIN"
                className={`${inputClass} text-center tracking-[0.3em]`}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                required
                maxLength={4}
                value={pinData.confirmPin}
                onChange={(e) => setPinData({ ...pinData, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="Re-enter PIN"
                className={`${inputClass} text-center tracking-[0.3em]`}
                autoComplete="off"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={savingPin || pinData.newPin.length < 4 || pinData.confirmPin.length < 4 || (hasPin && pinData.currentPin.length < 4)}
            className="w-full py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
          >
            {savingPin ? 'Saving…' : hasPin ? 'Change PIN' : 'Set PIN'}
          </button>
                  </form>
                </SettingsSection>
              )}
            </SettingsSections>
          </div>
        </>
      )}

      <GroupLabel>Signing in</GroupLabel>
      <div className={card}>
        <SettingsSections inset="card">
          <SettingsSection
            id="s-password"
            icon={ICONS.key}
            title="Password"
            summary="Change your password"
            open={open === 'password'}
            onToggle={() => toggle('password')}
          >
            <form onSubmit={handlePasswordChange}>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Current password</label>
            <input
              type="password"
              required
              value={pwData.currentPassword}
              onChange={(e) => setPwData({ ...pwData, currentPassword: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">New password</label>
            <input
              type="password"
              required
              minLength={8}
              value={pwData.newPassword}
              onChange={(e) => setPwData({ ...pwData, newPassword: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Confirm new password</label>
            <input
              type="password"
              required
              minLength={8}
              value={pwData.confirm}
              onChange={(e) => setPwData({ ...pwData, confirm: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={savingPw}
          className="w-full py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
        >
          {savingPw ? 'Saving…' : 'Change password'}
        </button>
            </form>
          </SettingsSection>
          <SettingsSection
            id="s-2fa"
            icon={ICONS.shield}
            title="Two-step sign-in"
            summary={user.twoFactorEnabled ? 'On' : 'Off · an extra code when you sign in'}
            open={open === '2fa'}
            onToggle={() => toggle('2fa')}
          >
            <div>
        {user.twoFactorEnabled ? (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-pitch-500" />
              <p className="text-sm text-pitch-700 font-medium">2FA is enabled</p>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Enter code to disable"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                className={inputClass}
              />
              <button
                onClick={handleDisable2FA}
                disabled={!disableCode || setting2FA}
                className="w-full py-2.5 text-sm font-semibold text-kit-600 border border-kit-400/40 rounded-xl hover:bg-kit-400/10 disabled:opacity-50 transition-colors"
              >
                {setting2FA ? 'Turning off…' : 'Turn off two-step sign-in'}
              </button>
            </div>
          </div>
        ) : twoFASetup ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Scan the QR code with your authenticator app:</p>
            <div className="flex justify-center">
              <img src={twoFASetup.qrCodeUrl} alt="2FA QR Code" className="w-48 h-48 rounded-xl" />
            </div>
            <p className="text-xs text-gray-500 text-center break-all font-mono bg-gray-50 p-3 rounded-xl">
              {twoFASetup.secret}
            </p>
            <input
              type="text"
              placeholder="Enter 6-digit code"
              value={twoFACode}
              onChange={(e) => setTwoFACode(e.target.value)}
              className={inputClass}
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setTwoFASetup(null); setTwoFACode(''); }}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleVerify2FA}
                disabled={!twoFACode || setting2FA}
                className="flex-1 py-2.5 text-sm font-bold text-volt-300 bg-ink rounded-xl hover:bg-pitch-900 disabled:opacity-50 transition-colors"
              >
                {setting2FA ? 'Checking…' : 'Verify & Enable'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              Ask for a code from an authenticator app each time you sign in, as well as your password.
            </p>
            <button
              onClick={handleSetup2FA}
              disabled={setting2FA}
              className="w-full py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
            >
              {setting2FA ? 'Setting up…' : 'Set up two-step sign-in'}
            </button>
          </div>
        )}
            </div>
          </SettingsSection>
        </SettingsSections>
      </div>
    </div>
  );
}
