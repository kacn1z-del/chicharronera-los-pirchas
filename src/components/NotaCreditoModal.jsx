// src/components/NotaCreditoModal.jsx
//
// Modal para emitir una nota de crédito (anular un comprobante facturado).
// Muestra:
//   - Información del comprobante original (clave, consecutivo, cliente)
//   - Campo para escribir el motivo de la anulación (max 180 caracteres)
//   - Botón para enviar
//   - Estados de carga, éxito y error

import React, { useState, useEffect } from 'react'
import './NotaCreditoModal.css'

export const NotaCreditoModal = ({ isOpen, onClose, order, onSuccess }) => {
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    if (!isOpen) {
      setMotivo('')
      setError(null)
      setSuccess(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        onClose()
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [success, onClose])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!order || !order.id) {
      setError('No hay pedido seleccionado')
      return
    }

    if (!motivo.trim()) {
      setError('Debes escribir un motivo para la anulación')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/emitir-nota-credito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          motivo: motivo.trim(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al emitir nota de crédito')
      }

      const data = await response.json()

      setSuccess({
        clave: data.clave,
        numeroConsecutivo: data.numeroConsecutivo,
        estado: data.aceptado ? 'aceptado' : data.pendiente ? 'pendiente' : 'rechazado',
        motivoRechazo: data.motivoRechazo,
      })

      if (onSuccess) {
        onSuccess(data)
      }
    } catch (err) {
      setError(err.message || 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const facturaClave = order?.facturaClave || ''
  const facturaConsecutivo = order?.facturaConsecutivo || ''
  const clientName = order?.clientName || 'Consumidor Final'
  const clientCedula = order?.clientCedula || 'N/A'

  return (
    <div className="nota-credito-overlay" onClick={onClose}>
      <div className="nota-credito-modal" onClick={(e) => e.stopPropagation()}>
        <button className="nota-credito-close" onClick={onClose}>
          ✕
        </button>

        {success ? (
          <div className="nota-credito-success">
            <h2>✅ Nota de Crédito Emitida</h2>
            <div className="success-details">
              <p>
                <strong>Clave:</strong> {success.clave}
              </p>
              <p>
                <strong>Consecutivo:</strong> {success.numeroConsecutivo}
              </p>
              <p>
                <strong>Estado:</strong> <span className={`estado-${success.estado}`}>{success.estado}</span>
              </p>
              {success.motivoRechazo && (
                <p className="rechazo-motivo">
                  <strong>Motivo del rechazo:</strong> {success.motivoRechazo}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <h2>Emitir Nota de Crédito</h2>

            <div className="nota-credito-info">
              <div className="info-group">
                <label>Comprobante Original</label>
                <p className="info-value">{facturaClave}</p>
              </div>
              <div className="info-group">
                <label>Consecutivo</label>
                <p className="info-value">{facturaConsecutivo}</p>
              </div>
              <div className="info-group">
                <label>Cliente</label>
                <p className="info-value">{clientName}</p>
              </div>
              <div className="info-group">
                <label>Cédula/RUC</label>
                <p className="info-value">{clientCedula}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="motivo">
                  Motivo de la Anulación <span className="required">*</span>
                </label>
                <textarea
                  id="motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={180}
                  placeholder="Ej: Cliente solicita cancelación de pedido"
                  rows={4}
                />
                <p className="char-count">
                  {motivo.length}/180
                </p>
              </div>

              {error && <div className="error-message">{error}</div>}

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={loading || !motivo.trim()}
                >
                  {loading ? 'Enviando...' : 'Emitir Nota de Crédito'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
