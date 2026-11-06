import { applicationStatuses } from '../lib/applications'

export default function StatusOptions() { return Object.entries(applicationStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>) }
