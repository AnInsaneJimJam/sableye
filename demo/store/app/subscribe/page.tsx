import { Subscribe } from '@/components/Subscribe'
import { SdkPanel } from '@/components/SdkPanel'

export default function ChaiClub() {
  return (
    <main className="narrow">
      <h1>Chai Club</h1>
      <p className="sub">A cup on us every cycle. You set the cap; the shop can never charge more, or more often, than the plan says.</p>
      <Subscribe />
      <SdkPanel files={[]} extraFiles={['app/api/plan/route.ts', 'lib/sableye.ts']} title="The Sableye code behind subscriptions" />
    </main>
  )
}
