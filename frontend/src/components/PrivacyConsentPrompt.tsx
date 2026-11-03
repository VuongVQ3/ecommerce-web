import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { PrivacyConsentLabel } from '../pages/AuthPages'
import { Checkbox } from './FormFields'
import Modal from './Modal'

const FAILED = 'Không lưu được. Vui lòng thử lại.'

/**
 * Accounts from before the separate privacy policy checkbox (no consent recorded) are asked once, right after
 * signing in, on every page: accept (unticked box, as at sign-up) or sign out. Guests never see it, so checking out
 * without an account is never blocked.
 */
export default function PrivacyConsentPrompt() {
  const { user, acceptPrivacyPolicy, logout } = useAuth()
  const [ticked, setTicked] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user?.privacyConsentRequired) return null

  const accept = async () => {
    if (!ticked) {
      setError('Bạn cần đồng ý với Chính sách bảo mật')
      return
    }
    setPending(true)
    setError(null)
    try {
      await acceptPrivacyPolicy()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : FAILED)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      title="Cập nhật Chính sách bảo mật"
      submitLabel="Đồng ý và tiếp tục"
      pendingLabel="Đang lưu..."
      cancelLabel="Đăng xuất"
      onSubmit={() => void accept()}
      onClose={() => void logout()}
      pending={pending}
      error={error}
    >
      <p className="text-sm text-stone-700">
        Chúng tôi đã cập nhật Chính sách bảo mật, trong đó có thời hạn lưu trữ dữ liệu và các quyền của bạn. Để tiếp tục dùng
        tài khoản, vui lòng đọc và đồng ý. Bạn vẫn có thể đặt hàng không cần tài khoản sau khi đăng xuất.
      </p>
      <Checkbox
        label={<PrivacyConsentLabel />}
        requiredMark
        checked={ticked}
        onChange={(e) => {
          setTicked(e.target.checked)
          setError(null)
        }}
      />
    </Modal>
  )
}
