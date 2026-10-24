import type { Billing } from '../../pricing/plans'

/** "Choose Grower" on the Pricing page: the account page signs the farmer in if needed, then offers checkout. */
export default function ChooseGrower({ billing }: { billing: Billing }) {
  return (
    <a href={`#/account?plan=grower&billing=${billing}`} className="btn-primary inline-flex min-h-12 w-full items-center justify-center">
      Choose Grower
    </a>
  )
}
