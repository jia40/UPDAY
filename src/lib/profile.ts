export function validateName(value: string) {
  const name = value.trim()
  if (name.length < 2 || name.length > 50) throw new Error('이름은 2~50자로 입력해주세요.')
  return name
}
