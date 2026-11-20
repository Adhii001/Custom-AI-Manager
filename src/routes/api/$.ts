import { createFileRoute } from '@tanstack/react-router'
import { handle } from '../../server/manager.server'
const serve = ({request}:{request:Request}) => handle(request)
export const Route = createFileRoute('/api/$')({server:{handlers:{GET:serve, POST:serve, DELETE:serve}}})
