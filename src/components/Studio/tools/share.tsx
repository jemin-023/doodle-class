import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import type { StudioTool, StudioToolProps } from '../types'
import { nbPost } from '../../../lib/notebook/ai'
import { SketchButton, SketchCard, Icon } from '../../ui'
import { Doodle } from '../../Doodles/Doodles'

interface ShareOutputData {
  code: string
  url?: string
}

export function ShareTool({ notebook, saveOutput, output }: StudioToolProps) {
  const savedCode =
    output?.data && typeof output.data === 'object' && 'code' in output.data
      ? String((output.data as ShareOutputData).code || '')
      : ''

  const [code, setCode] = useState<string>(savedCode)
  const [loading, setLoading] = useState<boolean>(!savedCode)
  const [error, setError] = useState<string>('')
  const [qrUrl, setQrUrl] = useState<string>('')
  const [copied, setCopied] = useState<boolean>(false)

  // Generate code if not provided via output
  useEffect(() => {
    if (code) return
    let active = true

    const run = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await nbPost<{ code: string }>('nbshare', {
          action: 'put',
          notebook,
        })
        if (!active) return
        if (res?.code) {
          setCode(res.code)
          const origin = typeof window !== 'undefined' ? window.location.origin : ''
          const url = `${origin}/nb/${res.code}`
          saveOutput({
            tool: 'share',
            title: `Shared: ${notebook.title}`,
            data: { code: res.code, url },
          })
        } else {
          setError('Could not generate a share code.')
        }
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to create share link')
      } finally {
        if (active) setLoading(false)
      }
    }

    run()
    return () => {
      active = false
    }
  }, [code, notebook, saveOutput])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const shareUrl = code ? `${origin}/nb/${code}` : ''

  // QR Code generation
  useEffect(() => {
    if (!shareUrl) {
      setQrUrl('')
      return
    }
    let active = true
    QRCode.toDataURL(shareUrl, {
      width: 440,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#23211e', light: '#fffefa' },
    })
      .then(url => {
        if (active) setQrUrl(url)
      })
      .catch(() => {
        if (active) setQrUrl('')
      })

    return () => {
      active = false
    }
  }, [shareUrl])

  const handleCopy = async () => {
    if (!shareUrl) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
      } else {
        const ta = document.createElement('textarea')
        ta.value = shareUrl
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore copy error */
    }
  }

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const handleNativeShare = async () => {
    if (!canNativeShare || !shareUrl) return
    try {
      await navigator.share({
        title: notebook.title,
        text: `Check out my notebook "${notebook.title}" on Doodle Class!`,
        url: shareUrl,
      })
    } catch {
      /* user cancelled or share failed */
    }
  }

  const waText = encodeURIComponent(
    `Check out my notebook "${notebook.title}" on Doodle Class: ${shareUrl}`
  )
  const waUrl = `https://wa.me/?text=${waText}`

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '36px 16px' }}>
        <Doodle name="plane" size={60} />
        <h4
          style={{
            fontFamily: 'var(--font-hand)',
            fontSize: '1.6rem',
            margin: '16px 0 6px',
            color: 'var(--ink)',
          }}
        >
          Creating your share link...
        </h4>
        <p style={{ fontSize: '0.95rem', color: 'var(--ink-soft)', margin: 0 }}>
          Packaging your notes and sources for your friends.
        </p>
      </div>
    )
  }

  if (error && !code) {
    return (
      <div style={{ textAlign: 'center', padding: '28px 16px' }}>
        <Doodle name="cloud" size={56} />
        <h4
          style={{
            fontFamily: 'var(--font-hand)',
            fontSize: '1.5rem',
            color: 'var(--marker-red)',
            margin: '14px 0 8px',
          }}
        >
          Couldn't create share link
        </h4>
        <p style={{ fontSize: '0.95rem', color: 'var(--ink-soft)', margin: '0 0 16px' }}>
          {error}
        </p>
        <SketchButton
          onClick={() => {
            setError('')
            setCode('')
          }}
        >
          Try Again
        </SketchButton>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '4px 0' }}>
      <SketchCard tilt={-0.4} style={{ padding: '20px', background: 'var(--paper-2)' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <p
            style={{
              fontFamily: 'var(--font-hand)',
              fontSize: '1.5rem',
              margin: '0 0 4px',
              color: 'var(--ink)',
            }}
          >
            Share with classmates & friends
          </p>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
            Anyone with this link can view your notes and make their own copy.
          </p>
        </div>

        {/* QR Code */}
        {qrUrl && (
          <div style={{ textAlign: 'center', margin: '0 auto 16px', maxWidth: 200 }}>
            <img
              src={qrUrl}
              alt={`QR code for notebook ${code}`}
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: 'var(--radius)',
                border: '2px solid var(--ink)',
                background: '#fffefa',
                display: 'block',
                boxShadow: 'var(--shadow)',
              }}
            />
            <div
              style={{
                fontFamily: 'var(--font-hand)',
                fontSize: '1.25rem',
                marginTop: 6,
                color: 'var(--ink)',
              }}
            >
              Code: <b style={{ letterSpacing: '1px' }}>{code}</b>
            </div>
          </div>
        )}

        {/* URL Input and Copy Button */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <input
            type="text"
            readOnly
            value={shareUrl}
            aria-label="Share URL"
            onClick={e => (e.target as HTMLInputElement).select()}
            style={{
              flex: '1 1 200px',
              minHeight: '44px',
              padding: '8px 12px',
              fontSize: '0.95rem',
              fontFamily: 'var(--font-body)',
              color: 'var(--ink)',
              background: 'var(--board)',
              border: '2px solid var(--ink)',
              borderRadius: 'var(--radius)',
            }}
          />
          <SketchButton
            onClick={handleCopy}
            color={copied ? 'var(--marker-green)' : undefined}
            style={{
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name={copied ? 'check' : 'pencil'} size={18} />
            <span>{copied ? 'Copied!' : 'Copy Link'}</span>
          </SketchButton>
        </div>

        {/* Social / Sharing Actions */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            justifyContent: 'center',
            paddingTop: 8,
            borderTop: '1px dashed var(--rule)',
          }}
        >
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <SketchButton
              color="var(--marker-green)"
              style={{
                minHeight: '44px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>Share to WhatsApp</span>
            </SketchButton>
          </a>
          {canNativeShare && (
            <SketchButton
              variant="ghost"
              onClick={handleNativeShare}
              style={{
                minHeight: '44px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="star" size={18} />
              <span>More options...</span>
            </SketchButton>
          )}
        </div>
      </SketchCard>
    </div>
  )
}

const tool: StudioTool = {
  id: 'share',
  title: 'Share',
  blurb: 'Send this notebook to a friend',
  icon: 'book',
  order: 9,
  Component: ShareTool,
}

export default tool
