import React from 'react';
import { errorId } from '../../utils/formErrors';

// Mensaje de error de un campo, con el id que referencia aria-describedby (utils/formErrors.js, D80).
// Va FUERA del <label>: dentro, el mensaje pasaba a formar parte del nombre accesible del control.
const FieldError = ({ prefix, k, errors, style }) => (errors?.[k]
  ? <span id={errorId(prefix, k)} style={{ display: 'block', color: '#B91C1C', fontSize: '0.75rem', fontWeight: 600, marginTop: '0.25rem', ...style }}>{errors[k]}</span>
  : null);

export default FieldError;
