'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { updateProfile, changePassword, setup2FA, verify2FA, disable2FA, getTransferPinStatus, setTransferPin, changeTransferPin, testOrganiserPush } from '@/lib/api';
import { PushToggle } from '@/components/pwa';
import { subscribeOrganiserPush } from '@/lib/api';
import { PageHeader } from '@/components/brand';
import { VerifyEmailRow } from '@/components/verify-email-modal';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  // Profile state
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
      toast.error(err.message || 'Failed to setup 2FA');
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
      toast.success('2FA enabled');
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
      toast.success('2FA disabled');
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
        <PushToggle save={subscribeOrganiserPush} test={testOrganiserPush} />
        <p className="text-[11px] text-gray-500 mt-1.5 px-1">Get a ping on this device when money lands, a game fills up or a transfer needs matching.</p>
      </div>

      {/* Profile Section */}
      <form onSubmit={handleProfileSave} className="bg-white rounded-3xl border border-gray-100 shadow-card p-5 mb-4">
        <h2 className="text-lg font-bold text-ink mb-4">Profile</h2>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">First Name</label>
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
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Last Name</label>
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
            placeholder="0803 123 4567"
            className={inputClass}
          />
          <p className="text-[11px] text-gray-500 mt-1">Optional — so your players and co-organisers can reach you.</p>
        </div>
        <VerifyEmailRow email={user.email} verified={!!user.emailVerified} onCheck={refreshUser} />
        <button
          type="submit"
          disabled={savingProfile}
          className="w-full py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
        >
          {savingProfile ? 'Saving...' : 'Update Profile'}
        </button>
      </form>

      {/* Change Password */}
      <form onSubmit={handlePasswordChange} className="bg-white rounded-3xl border border-gray-100 shadow-card p-5 mb-4">
        <h2 className="text-lg font-bold text-ink mb-4">Password</h2>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Current Password</label>
            <input
              type="password"
              required
              value={pwData.currentPassword}
              onChange={(e) => setPwData({ ...pwData, currentPassword: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">New Password</label>
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
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Confirm New Password</label>
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
          {savingPw ? 'Changing...' : 'Change Password'}
        </button>
      </form>

      {/* Transfer PIN */}
      {hasPin !== null && (
        <form onSubmit={handlePinSave} className="bg-white rounded-3xl border border-gray-100 shadow-card p-5 mb-4">
          <h2 className="text-lg font-bold text-ink mb-1">{hasPin ? 'Change Transfer PIN' : 'Set Transfer PIN'}</h2>
          <p className="text-xs text-gray-500 mb-4">
            {hasPin
              ? 'Enter your current PIN and choose a new 4-digit PIN.'
              : 'Set a 4-digit PIN to authorise payouts from group accounts.'}
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
                placeholder="Enter 4-digit PIN"
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
            {savingPin ? 'Saving...' : hasPin ? 'Change PIN' : 'Set PIN'}
          </button>
        </form>
      )}

      {/* 2FA Section */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-card p-5">
        <h2 className="text-lg font-bold text-ink mb-4">Two-Factor Authentication</h2>
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
                {setting2FA ? 'Disabling...' : 'Disable 2FA'}
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
                {setting2FA ? 'Verifying...' : 'Verify & Enable'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              Add an extra layer of security to your account with two-factor authentication.
            </p>
            <button
              onClick={handleSetup2FA}
              disabled={setting2FA}
              className="w-full py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
            >
              {setting2FA ? 'Setting up...' : 'Set Up 2FA'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
