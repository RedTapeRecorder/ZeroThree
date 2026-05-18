import { useState, useRef } from 'react'
import axios from 'axios'

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000'

/**
 * PhotoUploadModal
 *
 * Props:
 *   outletId    — integer, required
 *   outletName  — string, for display
 *   onClose     — called when modal is dismissed
 *   onSuccess   — called after successful upload, receives the new photo URL
 */
export default function PhotoUploadModal({ outletId, outletName, onClose, onSuccess }) {
  const [file, setFile]           = useState(null)
  const [preview, setPreview]     = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const inputRef                  = useRef(null)

  const token = localStorage.getItem('zt_token')
  const headers = { Authorization: `Bearer ${token}` }

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return

    // Validate type
    if (!f.type.startsWith('image/')) {
      setError('Please select an image file.')
      return
    }

    // Validate size — warn if over 5MB before Cloudinary compression
    if (f.size > 5 * 1024 * 1024) {
      setError('File is over 5MB. Please choose a smaller image.')
      return
    }

    setError('')
    setFile(f)

    // Generate local preview
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result)
    reader.readAsDataURL(f)
  }

  async function handleUpload() {
    if (!file || !preview) return
    setUploading(true)
    setError('')

    try {
      const res = await axios.post(
        `${API_URL}/api/v1/admin/outlets/${outletId}/photo`,
        { photo_base64: preview },
        { headers }
      )

      const photoUrl = res.data?.photo?.url ?? preview
      onSuccess(photoUrl)
      onClose()
    } catch (err) {
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) {
      // Simulate a file input change
      const dt = new DataTransfer()
      dt.items.add(f)
      inputRef.current.files = dt.files
      inputRef.current.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <h2 style={s.title}>Upload photo</h2>
            <p style={s.subtitle}>{outletName}</p>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={s.body}>

          {/* Drop zone / preview */}
          <div
            style={{ ...s.dropZone, ...(preview ? s.dropZoneWithPreview : {}) }}
            onClick={() => !preview && inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            {preview ? (
              <img src={preview} alt="Preview" style={s.preview} />
            ) : (
              <div style={s.dropPrompt}>
                <span style={s.dropIcon}>📷</span>
                <p style={s.dropText}>Click to select or drag and drop</p>
                <p style={s.dropHint}>JPEG, PNG, WEBP — max 5MB</p>
              </div>
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {/* File info */}
          {file && (
            <div style={s.fileInfo}>
              <span style={s.fileName}>{file.name}</span>
              <span style={s.fileSize}>{(file.size / 1024).toFixed(0)} KB</span>
              <button style={s.changeBtn} onClick={() => {
                setFile(null)
                setPreview(null)
                inputRef.current.value = ''
              }}>
                Change
              </button>
            </div>
          )}

          {error && <p style={s.error}>{error}</p>}

          <p style={s.note}>
            Manager-uploaded photos are approved immediately and become the current photo for this outlet. Cloudinary will compress the image to approximately 200KB.
          </p>
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <button style={s.cancelBtn} onClick={onClose} disabled={uploading}>
            Cancel
          </button>
          <button
            style={{
              ...s.uploadBtn,
              opacity: !file || uploading ? 0.5 : 1,
              cursor:  !file || uploading ? 'not-allowed' : 'pointer',
            }}
            disabled={!file || uploading}
            onClick={handleUpload}
          >
            {uploading ? 'Uploading…' : 'Upload photo'}
          </button>
        </div>
      </div>
    </div>
  )
}

const s = {
  overlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:        { background: '#fff', borderRadius: '14px', width: '480px', maxWidth: '95vw', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.2)', fontFamily: "'DM Sans','Segoe UI',sans-serif" },

  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px', borderBottom: '1px solid #f3f4f6' },
  title:        { fontSize: '16px', fontWeight: '700', color: '#111827', margin: 0 },
  subtitle:     { fontSize: '13px', color: '#6b7280', margin: '2px 0 0' },
  closeBtn:     { background: 'none', border: 'none', fontSize: '18px', color: '#9ca3af', cursor: 'pointer', padding: 0, flexShrink: 0 },

  body:         { padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' },

  dropZone:     { border: '2px dashed #e5e7eb', borderRadius: '10px', minHeight: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'border-color 0.15s', overflow: 'hidden' },
  dropZoneWithPreview: { border: '2px solid #f97316', cursor: 'default' },
  dropPrompt:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '24px' },
  dropIcon:     { fontSize: '32px', opacity: 0.5 },
  dropText:     { fontSize: '14px', fontWeight: '600', color: '#374151', margin: 0 },
  dropHint:     { fontSize: '12px', color: '#9ca3af', margin: 0 },
  preview:      { width: '100%', maxHeight: '280px', objectFit: 'cover', display: 'block' },

  fileInfo:     { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #f3f4f6' },
  fileName:     { fontSize: '13px', fontWeight: '500', color: '#111827', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  fileSize:     { fontSize: '12px', color: '#9ca3af', flexShrink: 0 },
  changeBtn:    { fontSize: '12px', color: '#f97316', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', flexShrink: 0 },

  error:        { fontSize: '13px', color: '#b91c1c', margin: 0 },
  note:         { fontSize: '11px', color: '#9ca3af', margin: 0, lineHeight: '1.6' },

  footer:       { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 24px', borderTop: '1px solid #f3f4f6' },
  cancelBtn:    { padding: '9px 18px', fontSize: '13px', fontWeight: '600', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', color: '#6b7280' },
  uploadBtn:    { padding: '9px 18px', fontSize: '13px', fontWeight: '600', background: '#f97316', color: '#fff', border: 'none', borderRadius: '8px' },
}
