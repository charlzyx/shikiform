/** `data-testid` for a control's props slot (`component={[Input, { ...tid('x') }]}`); antd puts it on the input. */
export const tid = (id: string) => ({ 'data-testid': id }) as {}
