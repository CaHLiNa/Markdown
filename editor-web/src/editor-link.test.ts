import {
  getCommandClickLinkHref,
  normalizeTableLinkSpacing,
  resolveLinkURL,
  shouldActivateLinkOnCommandClick
} from './editor-link'

describe('editor-link', () => {
  it('extracts the target href from a Vditor IR link node', () => {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = `
      <span data-type="a" class="vditor-ir__node vditor-ir__node--expand">
        <span class="vditor-ir__marker vditor-ir__marker--bracket">[</span>
        <span class="vditor-ir__link">OpenAI</span>
        <span class="vditor-ir__marker vditor-ir__marker--bracket">]</span>
        <span class="vditor-ir__marker vditor-ir__marker--paren">(</span>
        <span class="vditor-ir__marker vditor-ir__marker--link">https://openai.com</span>
        <span class="vditor-ir__marker vditor-ir__marker--paren">)</span>
      </span>
    `

    const label = wrapper.querySelector('.vditor-ir__link')
    const url = wrapper.querySelector('.vditor-ir__marker--link')

    expect(getCommandClickLinkHref(label)).toBe('https://openai.com')
    expect(getCommandClickLinkHref(url)).toBe('https://openai.com')
    expect(getCommandClickLinkHref(wrapper)).toBe(null)
  })

  it('only activates links for cmd-left-click', () => {
    expect(
      shouldActivateLinkOnCommandClick({
        button: 0,
        metaKey: true,
        defaultPrevented: false
      })
    ).toBe(true)

    expect(
      shouldActivateLinkOnCommandClick({
        button: 0,
        metaKey: false,
        defaultPrevented: false
      })
    ).toBe(false)

    expect(
      shouldActivateLinkOnCommandClick({
        button: 2,
        metaKey: true,
        defaultPrevented: false
      })
    ).toBe(false)
  })

  it('resolves document-relative links against the current document base URL', () => {
    expect(resolveLinkURL('assets/example.png', 'file:///Users/test/Documents/Notes/')).toBe(
      'file:///Users/test/Documents/Notes/assets/example.png'
    )
  })

  it('restores missing spaces around inline links inside table cells', () => {
    const table = document.createElement('table')
    table.innerHTML = `
      <tbody>
        <tr>
          <td>abc<span data-type="a" class="vditor-ir__node"><span class="vditor-ir__link">OpenAI</span></span>def</td>
        </tr>
      </tbody>
    `

    expect(normalizeTableLinkSpacing(table)).toBe(true)
    expect(table.querySelector('td')?.textContent).toBe('abc OpenAI def')
  })

  it('does not add spaces around links when punctuation is already adjacent', () => {
    const table = document.createElement('table')
    table.innerHTML = `
      <tbody>
        <tr>
          <td>(<span data-type="a" class="vditor-ir__node"><span class="vditor-ir__link">OpenAI</span></span>)</td>
        </tr>
      </tbody>
    `

    expect(normalizeTableLinkSpacing(table)).toBe(false)
    expect(table.querySelector('td')?.textContent).toBe('(OpenAI)')
  })
})
