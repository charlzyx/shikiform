import { expect, test } from '@playwright/test'
import { gotoHydrated } from './hydration'

test('UI guide: an echo instance turns red; a pure UI alert follows the amount and is not submitted', async ({ page }) => {
  await gotoHydrated(page, '/guide/ui')

  const echoDemo = page.locator('[data-ui-echo-demo]').first()
  await echoDemo.getByLabel('昵称').fill('abc')
  const echo = echoDemo.locator('[data-echo]')
  await expect(echo).toHaveText('abc')
  await expect(echo).toHaveAttribute('id', 'echo-nickname--echo')
  await expect(echo).not.toHaveCSS('color', 'rgb(255, 0, 0)')
  await echoDemo.getByLabel('昵称').fill('abcdefghij')
  await expect(echo).toHaveCSS('color', 'rgb(255, 0, 0)')
  await expect(echoDemo.getByLabel('昵称')).toHaveAttribute('id', 'echo-nickname')

  const alertDemo = page.locator('[data-ui-alert-demo]').first()
  await expect(alertDemo.getByRole('alert')).toHaveCount(0)
  await alertDemo.getByLabel('报销金额').fill('60000')
  await expect(alertDemo.getByRole('alert')).toContainText('主管审批')
  await alertDemo.getByRole('button', { name: /提\s*交/ }).click()
  await expect(alertDemo.locator('pre')).toHaveText('{"amount":60000}')
  await alertDemo.getByLabel('报销金额').fill('100')
  await expect(alertDemo.getByRole('alert')).toHaveCount(0)

  const boxDemo = page.locator('[data-ui-box-demo]').first()
  await boxDemo.getByRole('button', { name: /提\s*交/ }).click()
  await expect(boxDemo.locator('pre')).toHaveText('{"needInvoice":false,"remark":"保留"}')
})
