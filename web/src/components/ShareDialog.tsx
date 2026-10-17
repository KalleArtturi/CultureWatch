import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../state'

/** QR code for the address the app is open on, so an audience can open the same page on their phones. */
export function ShareDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const url = window.location.href
  const [src, setSrc] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const local = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)

  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => setSrc(null))
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [url, onClose])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      /* clipboard blocked: the link is shown as text anyway */
    }
  }

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={e => e.stopPropagation()}>
        <h2 id="share-title">{t.shareBox.title}</h2>
        <p className="secondary">{t.shareBox.sub}</p>
        {src && <img className="qr" src={src} width={280} height={280} alt="" />}
        <code className="share-url">{url}</code>
        {local && <p className="small error">{t.shareBox.localWarning}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={copy}>{copied ? t.shareBox.copied : t.shareBox.copy}</button>
          <button type="button" className="btn primary" ref={closeRef} onClick={onClose}>{t.shareBox.close}</button>
        </div>
      </div>
    </div>
  )
}
