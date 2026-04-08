/**
 * External dependencies
 */
import { render, screen, waitFor } from '@testing-library/react';

/**
 * Internal dependencies
 */
import { ActionModal } from '../index';
import type { ActionModal as ActionModalType } from '../../../types';

type TestItem = { id: number; title: string };

function createAction(
	overrides: Partial< ActionModalType< TestItem > > = {}
): ActionModalType< TestItem > {
	return {
		id: 'test-action',
		label: 'Test Action',
		RenderModal: ( { closeModal } ) => (
			<div>
				<p>Modal content</p>
				<button onClick={ closeModal }>Done</button>
			</div>
		),
		...overrides,
	};
}

describe( 'ActionModal', () => {
	it( 'renders with a dialog role by default', async () => {
		const action = createAction();

		render(
			<ActionModal
				action={ action }
				items={ [ { id: 1, title: 'Item' } ] }
				closeModal={ jest.fn() }
			/>
		);

		await waitFor( () => {
			expect( screen.getByRole( 'dialog' ) ).toBeVisible();
		} );
	} );

	it( 'renders with an alertdialog role when hideModalHeader is true', async () => {
		const action = createAction( { hideModalHeader: true } );

		render(
			<ActionModal
				action={ action }
				items={ [ { id: 1, title: 'Item' } ] }
				closeModal={ jest.fn() }
			/>
		);

		await waitFor( () => {
			expect( screen.getByRole( 'alertdialog' ) ).toBeVisible();
		} );
	} );

	it( "maps modalSize 'fill' to 'stretch' and emits a deprecation warning", async () => {
		const action = createAction( {
			modalSize: 'fill',
		} );

		render(
			<ActionModal
				action={ action }
				items={ [ { id: 1, title: 'Item' } ] }
				closeModal={ jest.fn() }
			/>
		);

		await waitFor( () => {
			expect( screen.getByRole( 'dialog' ) ).toBeVisible();
		} );

		expect( console ).toHaveWarnedWith(
			"modalSize: 'fill' is deprecated since version 7.8. Please use 'stretch' instead."
		);
	} );

	it( 'focuses the first input when modalFocusOnMount is "firstInputElement"', async () => {
		const action = createAction( {
			modalFocusOnMount: 'firstInputElement',
			RenderModal: () => (
				<div>
					<p>Some text</p>
					<input type="text" data-testid="first-input" />
					<input type="text" data-testid="second-input" />
				</div>
			),
		} );

		render(
			<ActionModal
				action={ action }
				items={ [ { id: 1, title: 'Item' } ] }
				closeModal={ jest.fn() }
			/>
		);

		await waitFor( () => {
			expect( screen.getByTestId( 'first-input' ) ).toHaveFocus();
		} );
	} );
} );
