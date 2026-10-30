import type { JSX } from 'react'
import { splitJiraKeys } from '../../../shared/jira'
import { useJiraSites } from '../lib/jira'

/** Text with the Jira issue keys in it as links to the issue, e.g. a commit message. */
export default function JiraText({ text }: { text: string }): JSX.Element {
  const parts = splitJiraKeys(text, useJiraSites())
  return (
    <>
      {parts.map((part, i) =>
        'key' in part ? (
          <a
            key={i}
            className="jira-key"
            href={part.url}
            title={`Open ${part.key} in Jira`}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void window.api.openExternal(part.url)
            }}
          >
            {part.text}
          </a>
        ) : (
          part.text
        )
      )}
    </>
  )
}
